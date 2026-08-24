import { isVideoPath, SYSTEM_FILES } from "$lib/constants";
import { errMsg } from "$lib/utils/errors";
import { exists, readDir, rename, stat } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import safeRegex from "safe-regex2";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { globToRegex, isEntryEmpty, isOrphan, matchesFilters, normalizeOrphanBase } from "./organizer-filters";
import { computeNewName, formatDuration } from "./organizer-rename";
import type { Entry, FilterConfig, MoveConfig, RenameConfig, ScanConfig, State } from "./organizer-types";

export type { EntryStatus } from "./organizer-types";
export type { Entry, FilterConfig, MoveConfig, RenameConfig, ScanConfig, State };

const DEBOUNCE_MS = 300;

function lowerSplit(name: string): [base: string, ext: string] {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? [name.slice(0, dot).toLowerCase(), name.slice(dot + 1).toLowerCase()] : [name.toLowerCase(), ""];
}

export class Organizer {
  // --- Path ---
  private _path = $state("");
  get path() {
    return this._path;
  }
  set path(v: string) {
    this._path = v.replace(/\/+$/, "");
  }
  private _pathError = $state("");
  readonly pathIsValid = $derived(!this._pathError);

  // --- Scan & filter config ---
  scanConfig: ScanConfig = $state({ recursive: false });
  filters: FilterConfig = $state({
    includePatterns: [],
    excludePatterns: [],
    excludeFiles: false,
    excludeFolders: false,
    excludeSystemFiles: true,
    isEmpty: false,
  });

  // --- Operation state ---
  private _state: State = $state("idle");

  // --- Move config ---
  moveConfig: MoveConfig = $state({ targetPath: "" });
  private _moveTargetError = $state("");
  readonly moveTargetIsValid = $derived(!this._moveTargetError);

  // --- Rename config ---
  renameConfig: RenameConfig = $state({
    matchPattern: ".*",
    renamePattern: "$<filename>",
  });
  private readonly _renameRegexResult = $derived.by(() => {
    if (!this.renameConfig.matchPattern) return { regex: null, error: "" };
    try {
      const regex = new RegExp(this.renameConfig.matchPattern);
      if (!safeRegex(regex)) return { regex: null, error: "Pattern may cause performance issues" };
      return { regex, error: "" };
    } catch (e) {
      return { regex: null, error: errMsg(e) };
    }
  });
  readonly renamePatternError = $derived(this._renameRegexResult.error);
  private readonly _renameRegex = $derived(this._renameRegexResult.regex);

  // --- Entries ---
  private _entries: Entry[] = $state([]);
  private _durationCache = $state(new SvelteMap<string, string>());
  private _durationLoading = $state(0);
  private _durationRequests = new SvelteMap<string, Promise<string>>();
  private _durationVersion = $state(0);
  readonly entryCount = $derived(this._entries.length);
  readonly activeCount = $derived(this._entries.filter((e) => !e.ignored).length);
  readonly durationLoading = $derived(this._durationLoading > 0);
  readonly durationVersion = $derived(this._durationVersion);
  readonly renameCount = $derived(
    this._entries.filter((e) => {
      if (e.ignored) return false;
      const duration = this._durationCache.get(e.path) ?? "";
      return computeNewName(e, this._renameRegex, this.renameConfig.renamePattern, duration) !== null;
    }).length,
  );

  // --- Scan progress ---
  private _scanned = $state(0);
  private _scanCount = 0;

  // --- Internal timers & request tracking ---
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  // --- Derived scan inputs ---
  private readonly _compiledPatterns = $derived({
    include: this.filters.includePatterns.map(globToRegex).filter((r) => r !== null),
    exclude: this.filters.excludePatterns.map(globToRegex).filter((r) => r !== null),
  });
  private readonly _scanConfig = $derived({
    path: this.path,
    includePatterns: this.filters.includePatterns.join("\0"),
    excludePatterns: this.filters.excludePatterns.join("\0"),
    excludeFiles: this.filters.excludeFiles,
    excludeFolders: this.filters.excludeFolders,
    excludeSystemFiles: this.filters.excludeSystemFiles,
    recursive: this.scanConfig.recursive,
    isEmpty: this.filters.isEmpty,
    orphanCheck: this.filters.orphanCheck?.partnerExtensions.join("\0") ?? "",
  });

  readonly cleanup: () => void;

  get durationCache() {
    return this._durationCache;
  }

  private _isVideoEntry(entry: Entry): boolean {
    return entry.isFile && isVideoPath(entry.path);
  }

  private async _getVideoDuration(entry: Entry): Promise<string> {
    const existing = this._durationCache.get(entry.path);
    if (existing !== undefined) return existing;
    if (!this._isVideoEntry(entry)) return "";

    if (this._durationRequests.has(entry.path)) {
      return this._durationRequests.get(entry.path)!;
    }

    const promise = (async () => {
      this._durationLoading += 1;
      try {
        const seconds = await invoke<number>("get_video_duration", { path: `${this.path}/${entry.path}` });
        const formatted = formatDuration(seconds);
        this._durationCache.set(entry.path, formatted);
        this._durationVersion += 1;
        return formatted;
      } catch {
        this._durationCache.set(entry.path, "");
        this._durationVersion += 1;
        return "";
      } finally {
        this._durationLoading = Math.max(0, this._durationLoading - 1);
        this._durationRequests.delete(entry.path);
      }
    })();

    this._durationRequests.set(entry.path, promise);
    return promise;
  }

  previewName(entry: Entry, durationHint?: string): string | null {
    if (!this._renameRegex) return null;
    const durationPattern = this.renameConfig.renamePattern.includes("$<length>");
    if (durationPattern && !this._isVideoEntry(entry)) return null;

    let duration = durationHint ?? "";
    if (durationPattern) {
      if (!duration && this._durationCache.has(entry.path)) {
        duration = this._durationCache.get(entry.path) ?? "";
      }
    }
    return computeNewName(entry, this._renameRegex, this.renameConfig.renamePattern, duration);
  }

  async ensureDuration(entry: Entry): Promise<string> {
    return this._getVideoDuration(entry);
  }

  // --- Getters ---

  get state() {
    return this._state;
  }

  get pathError() {
    return this._pathError;
  }

  get moveTargetError() {
    return this._moveTargetError;
  }

  get renameRegex() {
    return this._renameRegex;
  }

  get entries() {
    return this._entries;
  }

  get scanned() {
    return this._scanned;
  }

  get isExecuting() {
    return this._state === "deleting" || this._state === "renaming" || this._state === "moving";
  }

  // --- Constructor ---

  constructor() {
    this.cleanup = $effect.root(() => {
      $effect(() => {
        void this._scanConfig;
        this._scan();
      });
      $effect(() => {
        void this.moveConfig.targetPath;
        this._validateMoveTarget();
      });
      $effect(() => {
        void this._entries;
        if (this.renameConfig.renamePattern.includes("$<length>")) {
          void this._preloadDurations();
        }
      });
    });
  }

  // --- Public methods ---

  reload() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    void this._runScan(++this.requestId);
  }

  async deleteAll() {
    if (this.isExecuting) return;
    this._state = "deleting";
    try {
      const eligibleEntries: Entry[] = [];
      for (const entry of [...this._entries].reverse()) {
        if (entry.ignored) continue;
        const fullPath = `${this.path}/${entry.path}`;
        try {
          if (!(await exists(fullPath))) {
            entry.status = { ok: false, message: "Not found" };
            continue;
          }
          if (this.filters.isEmpty && !(await isEntryEmpty(fullPath, entry.isFile))) {
            entry.status = { ok: false, message: "Not empty" };
            continue;
          }
          eligibleEntries.push(entry);
        } catch (e) {
          entry.status = { ok: false, message: errMsg(e) };
        }
      }

      const paths = eligibleEntries
        .filter(
          (entry, index, entries) =>
            !entries.some((other, otherIndex) => {
              if (index === otherIndex) return false;
              return entry.path.startsWith(`${other.path}/`);
            }),
        )
        .map((entry) => `${this.path}/${entry.path}`);
      if (paths.length === 0) return;

      try {
        await invoke("move_to_trash", { paths });
        for (const entry of eligibleEntries) entry.status = { ok: true };
      } catch (e) {
        const message = errMsg(e);
        for (const entry of eligibleEntries) entry.status = { ok: false, message };
      }
    } finally {
      this._state = "done";
    }
  }

  async renameAll() {
    if (this.isExecuting || this.durationLoading) return;
    this._state = "renaming";
    try {
      const needsDuration = this.renameConfig.renamePattern.includes("$<length>");
      const durationByPath = new SvelteMap<string, string>();
      if (needsDuration) {
        await Promise.all(
          this._entries.map(async (entry) => {
            if (entry.ignored) return;
            if (!this._isVideoEntry(entry)) return;
            const duration = await this._getVideoDuration(entry);
            if (duration) {
              durationByPath.set(entry.path, duration);
            }
          }),
        );
      }

      const newPaths = new SvelteMap<Entry, string>();
      for (const entry of this._entries) {
        if (entry.ignored) continue;
        const duration = durationByPath.get(entry.path) ?? "";
        const newName = computeNewName(entry, this._renameRegex, this.renameConfig.renamePattern, duration);
        if (newName === null) continue;
        const dir = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/") + 1) : "";
        const newFullPath = `${this.path}/${dir}${newName}`;
        if (newFullPath !== `${this.path}/${entry.path}`) newPaths.set(entry, newFullPath);
      }

      const targetMap = new SvelteMap<string, Entry>();
      for (const [entry, newFullPath] of newPaths) {
        if (targetMap.has(newFullPath)) {
          entry.status = { ok: false, message: "Name conflict with another entry" };
          targetMap.get(newFullPath)!.status = { ok: false, message: "Name conflict with another entry" };
        } else {
          targetMap.set(newFullPath, entry);
        }
      }

      const sourcePaths = new SvelteSet([...newPaths.keys()].map((e) => `${this.path}/${e.path}`));
      for (const [entry, newFullPath] of newPaths) {
        if (entry.status) continue;
        const oldFullPath = `${this.path}/${entry.path}`;
        try {
          if (!(await exists(oldFullPath))) {
            entry.status = { ok: false, message: "Not found" };
            continue;
          }
          if (!sourcePaths.has(newFullPath) && (await exists(newFullPath))) {
            entry.status = { ok: false, message: "Already exists" };
            continue;
          }
          await rename(oldFullPath, newFullPath);
          entry.status = { ok: true };
        } catch (e) {
          entry.status = { ok: false, message: errMsg(e) };
        }
      }
    } finally {
      this._state = "done";
    }
  }

  async moveAll() {
    if (this.isExecuting) return;
    if (!this.moveTargetIsValid) return;
    this._state = "moving";
    try {
      try {
        const targetInfo = await stat(this.moveConfig.targetPath);
        if (!targetInfo.isDirectory) {
          this._moveTargetError = "Path is not a directory";
          return;
        }
      } catch (e) {
        this._moveTargetError = errMsg(e);
        return;
      }

      const targetMap = new SvelteMap<string, Entry>();
      for (const entry of this._entries) {
        if (entry.ignored || !entry.isFile) continue;
        const basename = entry.path.split("/").pop();
        if (!basename) continue;
        const newFullPath = `${this.moveConfig.targetPath}/${basename}`;
        if (targetMap.has(newFullPath)) {
          entry.status = { ok: false, message: "Name conflict with another entry" };
          targetMap.get(newFullPath)!.status = { ok: false, message: "Name conflict with another entry" };
        } else {
          targetMap.set(newFullPath, entry);
        }
      }

      for (const [newFullPath, entry] of targetMap) {
        if (entry.status) continue;
        const oldFullPath = `${this.path}/${entry.path}`;
        try {
          if (!(await exists(oldFullPath))) {
            entry.status = { ok: false, message: "Not found" };
            continue;
          }
          if (await exists(newFullPath)) {
            entry.status = { ok: false, message: "Already exists" };
            continue;
          }
          await rename(oldFullPath, newFullPath);
          entry.status = { ok: true };
        } catch (e) {
          entry.status = { ok: false, message: errMsg(e) };
        }
      }
    } finally {
      this._state = "done";
    }
  }

  // --- Private methods ---

  private _compareEntryPaths(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  }

  private _sortEntries(entries: Entry[]): Entry[] {
    return [...entries].sort((a, b) => this._compareEntryPaths(a.path, b.path));
  }

  private _validateMoveTarget() {
    if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
    this.moveDebounceTimer = setTimeout(async () => {
      if (!this.moveConfig.targetPath) {
        this._moveTargetError = "";
        return;
      }
      try {
        const info = await stat(this.moveConfig.targetPath);
        this._moveTargetError = info.isDirectory ? "" : "Path is not a directory";
      } catch (e) {
        this._moveTargetError = errMsg(e);
      }
    }, DEBOUNCE_MS);
  }

  private _scan() {
    this._pathError = "";

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (!this.path) {
      this.requestId++;
      this._entries = [];
      this._state = "idle";
      return;
    }

    const currentId = ++this.requestId;
    this.debounceTimer = setTimeout(() => void this._runScan(currentId), DEBOUNCE_MS);
  }

  private async _preloadDurations() {
    if (!this.path) return;
    if (!this.renameConfig.renamePattern.includes("$<length>")) return;
    await Promise.all(
      this._entries
        .filter((entry) => !entry.ignored && this._isVideoEntry(entry))
        .map((entry) => this._getVideoDuration(entry)),
    );
  }

  private async _runScan(currentId: number) {
    this._state = "scanning";
    this._durationCache = new SvelteMap();

    try {
      const info = await stat(this.path);
      if (!info.isDirectory) {
        if (currentId !== this.requestId) return;
        this._pathError = "Path is not a directory";
        return;
      }

      const entries: Entry[] = [];
      this._scanCount = 0;

      await this._scanDir("", currentId, entries);

      if (currentId !== this.requestId) return;
      this._entries = this._sortEntries(entries);
      this._pathError = "";
    } catch (e) {
      if (currentId !== this.requestId) return;
      this._pathError = errMsg(e);
      this._entries = [];
    } finally {
      if (currentId === this.requestId) {
        this._state = "idle";
      }
    }
  }

  // Returns true if all non-system children of this directory would be deleted,
  // i.e. the directory would become empty after the operation.
  private async _scanDir(
    relPath: string,
    requestId: number,
    result: Entry[],
    rootResult: Entry[] = result,
  ): Promise<boolean> {
    if (requestId !== this.requestId) return false;

    const fullPath = relPath ? `${this.path}/${relPath}` : this.path;
    let realEntries: Awaited<ReturnType<typeof readDir>>;
    try {
      realEntries = await readDir(fullPath);
    } catch (e) {
      if (!relPath) throw e;
      return false;
    }

    let siblingMap: SvelteMap<string, SvelteSet<string>> | undefined;
    if (this.filters.orphanCheck) {
      siblingMap = new SvelteMap();
      for (const e of realEntries) {
        if (!e.name || !e.isFile) continue;
        const [base, ext] = lowerSplit(e.name);
        let exts = siblingMap.get(base);
        if (!exts) {
          exts = new SvelteSet<string>();
          siblingMap.set(base, exts);
        }
        exts.add(ext);
      }
    }

    let allWillBeDeleted = true;

    for (const entry of realEntries) {
      if (requestId !== this.requestId) return false;

      const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      const isSystem = SYSTEM_FILES.has(entry.name);
      let entryWillBeDeleted = false;

      if (!entry.isFile) {
        const subResult: Entry[] = [];
        let childrenWouldBeEmpty = false;

        if (this.scanConfig.recursive && !entry.isSymlink) {
          const childrenExcluded = this._compiledPatterns.exclude.some((r) => r.test(entryRelPath));
          if (!childrenExcluded) {
            try {
              childrenWouldBeEmpty = await this._scanDir(entryRelPath, requestId, subResult, rootResult);
            } catch {
              childrenWouldBeEmpty = false;
            }
            if (requestId !== this.requestId) return false;
          }
        }

        if (matchesFilters(entryRelPath, false, this.filters, this._compiledPatterns)) {
          let passes = !this.filters.isEmpty;
          if (!passes) {
            const currentlyEmpty = await isEntryEmpty(`${this.path}/${entryRelPath}`, false).catch(() => false);
            passes = currentlyEmpty || childrenWouldBeEmpty;
          }
          if (passes) {
            result.push({ path: entryRelPath, isFile: false, ignored: false });
            entryWillBeDeleted = true;
          }
        }

        result.push(...subResult);
      } else {
        if (matchesFilters(entryRelPath, true, this.filters, this._compiledPatterns)) {
          if (!this.filters.isEmpty || (await isEntryEmpty(`${this.path}/${entryRelPath}`, true).catch(() => false))) {
            let passesOrphanCheck = true;
            if (siblingMap) {
              const [base] = lowerSplit(entry.name ?? "");
              // _O/_o prefix (IMG_O1234) maps to the main file base (IMG_1234); only non-_O partners count
              const normSiblings = siblingMap.get(normalizeOrphanBase(base));
              passesOrphanCheck = !normSiblings || isOrphan(normSiblings, this.filters.orphanCheck!.partnerExtensions);
            }
            if (passesOrphanCheck) {
              result.push({ path: entryRelPath, isFile: true, ignored: false });
              entryWillBeDeleted = true;
            }
          }
        }
      }

      if (!isSystem && !entryWillBeDeleted) allWillBeDeleted = false;

      if (++this._scanCount % 200 === 0) {
        this._scanned = rootResult.length;
        this._entries = this._sortEntries(rootResult);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (requestId !== this.requestId) return false;
      }
    }

    return allWillBeDeleted;
  }
}
