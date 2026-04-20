import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir, readDir, remove, stat, watch } from "@tauri-apps/plugin-fs";
import type { UnwatchFn } from "@tauri-apps/plugin-fs";
import { SYSTEM_FILES } from "$lib/constants";
import { SvelteDate, SvelteSet } from "svelte/reactivity";

export type Operation = "rotate_left" | "rotate_right" | "fix";

export interface LogEntry {
  id: number;
  filename: string;
  filePath: string;
  operation: Operation;
  status: "queued" | "processing" | "done" | "error";
  message?: string;
  timestamp: Date;
}

export const SUBFOLDERS: Operation[] = ["rotate_left", "rotate_right", "fix"];

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

const DEBOUNCE_MS = 300;
const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mkv",
  "avi",
  "mov",
  "wmv",
  "flv",
  "webm",
  "m4v",
  "mpeg",
  "mpg",
  "ts",
  "mts",
  "m2ts",
  "3gp",
  "ogv",
]);

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class Watcher {
  path = $state("");
  private _pathError = $state("");
  readonly pathIsValid = $derived(!this._pathError);
  private _watching = $state(false);
  readonly watching = $derived(this._watching);

  log: LogEntry[] = $state([]);

  private get _basePath(): string {
    return normalizePath(this.path);
  }

  private _nextId = 0;
  private _running = false;
  private _currentEntry: LogEntry | null = null;
  private _cancellingEntry: LogEntry | null = null;
  private _queue: LogEntry[] = [];
  private _processing = new SvelteSet<string>();
  private _waiting = new SvelteSet<string>();
  private _unwatch: UnwatchFn | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly cleanup: () => void;

  get pathError() {
    return this._pathError;
  }

  constructor() {
    this.cleanup = $effect.root(() => {
      $effect(() => {
        void this.path;
        this._onPathChange();
      });
      return () => {
        this._stopWatching();
      };
    });
  }

  private _onPathChange() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => void this._applyPathChange().catch(() => {}), DEBOUNCE_MS);
  }

  private async _applyPathChange() {
    this._stopWatching();
    this.log = [];
    this._queue = [];

    if (!this.path) {
      this._pathError = "";
      return;
    }

    try {
      const info = await stat(this.path);
      if (!info.isDirectory) {
        this._pathError = "Path is not a directory";
        return;
      }
      this._pathError = "";
      await this._startWatching();
    } catch (e) {
      this._pathError = errMsg(e);
    }
  }

  private async _clearTmp() {
    const tmpDir = `${this._basePath}/tmp`;
    if (!(await exists(tmpDir))) return;
    const entries = await readDir(tmpDir);
    const activeTmpName = this._currentEntry ? `${this._currentEntry.operation}_${this._currentEntry.filename}` : null;
    await Promise.allSettled(entries.filter((e) => e.name !== activeTmpName).map((e) => remove(`${tmpDir}/${e.name}`)));
  }

  private async _startWatching() {
    await this._ensureSubfolders();
    await this._clearTmp();

    const base = this._basePath;
    const watchPaths = [base, ...SUBFOLDERS.map((op) => `${base}/${op}`)];

    for (const op of SUBFOLDERS) {
      const entries = await readDir(`${base}/${op}`);
      for (const entry of entries) {
        void this._onFileCreated(`${base}/${op}/${entry.name}`).catch(() => {});
      }
    }

    this._unwatch = await watch(watchPaths, (event) => {
      for (const filePath of event.paths) {
        void this._onWatchEvent(filePath).catch(() => {});
      }
    });
    this._watching = true;
  }

  private _stopWatching() {
    if (this._unwatch) {
      this._unwatch();
      this._unwatch = null;
    }
    this._watching = false;
    if (this.path) void this._clearTmp().catch(() => {});
  }

  private async _ensureSubfolders() {
    const base = this._basePath;
    for (const folder of [...SUBFOLDERS, "output", "tmp"]) {
      const folderPath = `${base}/${folder}`;
      if (!(await exists(folderPath))) {
        await mkdir(folderPath, { recursive: true });
      }
    }
  }

  private async _onWatchEvent(rawPath: string) {
    const filePath = normalizePath(rawPath);
    const base = this._basePath;
    const knownFolders = [...SUBFOLDERS, "output", "tmp"];
    if (knownFolders.some((f) => filePath === `${base}/${f}`)) {
      await this._ensureSubfolders();
      return;
    }

    const queuedIdx = this._queue.findIndex((e) => e.filePath === filePath);
    if (queuedIdx !== -1) {
      try {
        const info = await stat(filePath);
        if (!info.isFile) throw new Error();
      } catch {
        this._queue.splice(queuedIdx, 1);
        this._processing.delete(filePath);
        this.log = this.log.filter((e) => e.filePath !== filePath || e.status === "processing");
        return;
      }
    }
    void this._onFileCreated(filePath).catch(() => {});
  }

  private async _waitUntilStable(filePath: string): Promise<void> {
    let stableCount = 0;
    let lastSize = -1;
    while (stableCount < 2) {
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      const info = await stat(filePath);
      if (!info.isFile) throw new Error("Not a file");
      if (info.size === lastSize) {
        stableCount++;
      } else {
        stableCount = 0;
        lastSize = info.size;
      }
    }
  }

  private async _onFileCreated(rawPath: string) {
    const filePath = normalizePath(rawPath);
    if (this._processing.has(filePath)) return;
    if (this._waiting.has(filePath)) return;

    const parts = filePath.split("/");
    const filename = parts[parts.length - 1];
    const folder = parts[parts.length - 2] as Operation;

    if (!SUBFOLDERS.includes(folder)) return;
    if (SYSTEM_FILES.has(filename)) return;
    const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext)) return;

    try {
      const info = await stat(filePath);
      if (!info.isFile) return;
    } catch {
      return;
    }

    this._waiting.add(filePath);
    try {
      await this._waitUntilStable(filePath);
    } catch {
      this._waiting.delete(filePath);
      return;
    }
    this._waiting.delete(filePath);

    await this._enqueue(filePath, filename, folder);
  }

  private async _enqueue(filePath: string, filename: string, operation: Operation) {
    if (this._processing.has(filePath)) return;
    this._processing.add(filePath);

    this.log.unshift({
      id: this._nextId++,
      filename,
      filePath,
      operation,
      status: "queued",
      timestamp: new SvelteDate(),
    });
    const entry = this.log[0];
    this._queue.push(entry);

    if (!this._running) void this._runNext().catch(() => {});
  }

  private async _runNext() {
    const entry = this._queue.shift();
    if (!entry) {
      this._running = false;
      this._currentEntry = null;
      return;
    }
    this._running = true;
    this._currentEntry = entry;
    entry.status = "processing";

    try {
      const base = this._basePath;
      const warning = await invoke<string | null>("process_video", {
        input: entry.filePath,
        operation: entry.operation,
        tmpDir: `${base}/tmp`,
        outputDir: `${base}/output`,
      });
      entry.status = "done";
      if (warning) entry.message = warning;
    } catch (e) {
      entry.status = "error";
      entry.message = this._cancellingEntry === entry ? "Cancelled" : errMsg(e);
      this._cancellingEntry = null;
    } finally {
      this._processing.delete(entry.filePath);
      this._currentEntry = null;
    }

    void this._runNext().catch(() => {});
  }

  async cancelCurrent() {
    if (!this._running || !this._currentEntry) return;
    this._cancellingEntry = this._currentEntry;
    try {
      await invoke("cancel_video");
    } catch {
      this._cancellingEntry = null;
    }
  }

  clearFinished() {
    this.log = this.log.filter((e) => e.status === "queued" || e.status === "processing");
  }

  async retry(entry: LogEntry) {
    if (entry.status !== "error") return;
    if (this._processing.has(entry.filePath)) return;
    this._processing.add(entry.filePath);
    try {
      const info = await stat(entry.filePath);
      if (!info.isFile) {
        this._processing.delete(entry.filePath);
        entry.message = "File no longer exists";
        return;
      }
    } catch {
      this._processing.delete(entry.filePath);
      entry.message = "File no longer exists";
      return;
    }
    entry.status = "queued";
    entry.message = undefined;
    this._queue.push(entry);
    if (!this._running) void this._runNext().catch(() => {});
  }
}
