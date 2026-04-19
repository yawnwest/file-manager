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

const SUBFOLDERS: Operation[] = ["rotate_left", "rotate_right", "fix"];
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

  private _nextId = 0;
  private _running = false;
  private _cancelling = false;
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
    this._debounceTimer = setTimeout(() => void this._applyPathChange(), DEBOUNCE_MS);
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
    const tmpDir = `${this.path}/tmp`;
    if (!(await exists(tmpDir))) return;
    const entries = await readDir(tmpDir);
    await Promise.all(entries.map((e) => remove(`${tmpDir}/${e.name}`)));
  }

  private async _startWatching() {
    for (const folder of [...SUBFOLDERS, "output", "tmp"]) {
      const folderPath = `${this.path}/${folder}`;
      if (!(await exists(folderPath))) {
        await mkdir(folderPath, { recursive: true });
      }
    }
    await this._clearTmp();

    const watchPaths = [this.path, ...SUBFOLDERS.map((op) => `${this.path}/${op}`)];

    for (const op of SUBFOLDERS) {
      const entries = await readDir(`${this.path}/${op}`);
      for (const entry of entries) {
        void this._onFileCreated(`${this.path}/${op}/${entry.name}`);
      }
    }

    this._unwatch = await watch(watchPaths, (event) => {
      for (const filePath of event.paths) {
        void this._onWatchEvent(filePath);
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
    if (this.path) void this._clearTmp();
  }

  private async _ensureSubfolders() {
    for (const folder of [...SUBFOLDERS, "output", "tmp"]) {
      const folderPath = `${this.path}/${folder}`;
      if (!(await exists(folderPath))) {
        await mkdir(folderPath, { recursive: true });
      }
    }
  }

  private async _onWatchEvent(filePath: string) {
    const normalized = filePath.replace(/\\/g, "/");
    const knownFolders = [...SUBFOLDERS, "output", "tmp"];
    if (knownFolders.some((f) => normalized === `${this.path}/${f}`.replace(/\\/g, "/"))) {
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
    void this._onFileCreated(filePath);
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

  private async _onFileCreated(filePath: string) {
    if (this._processing.has(filePath)) return;
    if (this._waiting.has(filePath)) return;

    const normalized = filePath.replace(/\\/g, "/");
    const parts = normalized.split("/");
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

    if (!this._running) void this._runNext();
  }

  private async _runNext() {
    const entry = this._queue.shift();
    if (!entry) {
      this._running = false;
      return;
    }
    this._running = true;
    entry.status = "processing";

    try {
      const warning = await invoke<string | null>("process_video", {
        input: entry.filePath,
        operation: entry.operation,
        tmpDir: `${this.path}/tmp`,
        outputDir: `${this.path}/output`,
      });
      entry.status = "done";
      if (warning) entry.message = warning;
    } catch (e) {
      entry.status = "error";
      entry.message = this._cancelling ? "Cancelled" : errMsg(e);
      this._cancelling = false;
    } finally {
      this._processing.delete(entry.filePath);
    }

    void this._runNext();
  }

  async cancelCurrent() {
    if (!this._running) return;
    this._cancelling = true;
    try {
      await invoke("cancel_video");
    } catch {
      this._cancelling = false;
    }
  }

  clearFinished() {
    this.log = this.log.filter((e) => e.status === "queued" || e.status === "processing");
  }

  async retry(entry: LogEntry) {
    if (entry.status !== "error") return;
    if (this._processing.has(entry.filePath)) return;
    try {
      const info = await stat(entry.filePath);
      if (!info.isFile) {
        entry.message = "File no longer exists";
        return;
      }
    } catch {
      entry.message = "File no longer exists";
      return;
    }
    this._processing.add(entry.filePath);
    entry.status = "queued";
    entry.message = undefined;
    this._queue.push(entry);
    if (!this._running) void this._runNext();
  }
}
