import { SYSTEM_FILES } from "$lib/constants";
import { exists, readDir, remove, rename, stat } from "@tauri-apps/plugin-fs";
import safeRegex from "safe-regex2";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { globToRegex, isEntryEmpty, matchesFilters } from "./organizer-filters";
import { computeNewName } from "./organizer-rename";
import type { Entry, FilterConfig, MoveConfig, RenameConfig, ScanConfig, State } from "./organizer-types";

export type { EntryStatus } from "./organizer-types";
export type { Entry, FilterConfig, MoveConfig, RenameConfig, ScanConfig, State };

export class Organizer {
  // --- Path ---
  path = $state("");
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
    matchPattern: "",
    renamePattern: "",
  });
  private readonly _renameRegexResult = $derived.by(() => {
    if (!this.renameConfig.matchPattern) return { regex: null, error: "" };
    try {
      const regex = new RegExp(this.renameConfig.matchPattern);
      if (!safeRegex(regex)) return { regex: null, error: "Pattern may cause performance issues" };
      return { regex, error: "" };
    } catch (e) {
      return { regex: null, error: String(e) };
    }
  });
  readonly renamePatternError = $derived(this._renameRegexResult.error);
  private readonly _renameRegex = $derived(this._renameRegexResult.regex);

  // --- Entries ---
  private _entries: Entry[] = $state([]);
  readonly entryCount = $derived(this._entries.length);
  readonly activeCount = $derived(this._entries.filter((e) => !e.ignored).length);
  readonly renameCount = $derived(
    this._entries.filter(
      (e) => !e.ignored && computeNewName(e, this._renameRegex, this.renameConfig.renamePattern) !== null,
    ).length,
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
  });

  readonly cleanup: () => void;

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

  // TODO review
  async deleteAll() {
    if (this.isExecuting) return;
    this._state = "deleting";
    try {
      for (const entry of [...this._entries].reverse()) {
        if (entry.ignored) continue;
        const fullPath = `${this.path}/${entry.path}`;
        try {
          if (!(await exists(fullPath))) {
            entry.status = { ok: false, message: "Not found" };
            continue;
          }
          if (this.filters.isEmpty && !entry.isFile && !(await isEntryEmpty(fullPath, false))) {
            entry.status = { ok: false, message: "Not empty" };
            continue;
          }
          await remove(fullPath, { recursive: true });
          entry.status = { ok: true };
        } catch (e) {
          entry.status = { ok: false, message: String(e) };
        }
      }
    } finally {
      this._state = "done";
    }
  }

  // TODO review
  async renameAll() {
    if (this.isExecuting) return;
    this._state = "renaming";
    try {
      const newPaths = new SvelteMap<Entry, string>();
      for (const entry of this._entries) {
        if (entry.ignored) continue;
        const newName = computeNewName(entry, this._renameRegex, this.renameConfig.renamePattern);
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

      const sourcePaths = new SvelteSet(this._entries.filter((e) => !e.ignored).map((e) => `${this.path}/${e.path}`));
      for (const [newFullPath, entry] of targetMap) {
        if (entry.status) continue;
        if (!sourcePaths.has(newFullPath) && (await exists(newFullPath))) {
          entry.status = { ok: false, message: "Already exists" };
        }
      }

      for (const [entry, newFullPath] of newPaths) {
        if (entry.status) continue;
        const oldFullPath = `${this.path}/${entry.path}`;
        try {
          if (!(await exists(oldFullPath))) {
            entry.status = { ok: false, message: "Not found" };
            continue;
          }
          await rename(oldFullPath, newFullPath);
          entry.status = { ok: true };
        } catch (e) {
          entry.status = { ok: false, message: String(e) };
        }
      }
    } finally {
      this._state = "done";
    }
  }

  // TODO review
  async moveAll() {
    if (this.isExecuting) return;
    this._state = "moving";
    try {
      const targetMap = new SvelteMap<string, Entry>();
      for (const entry of this._entries) {
        if (entry.ignored) continue;
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
        if (await exists(newFullPath)) {
          entry.status = { ok: false, message: "Already exists" };
        }
      }

      for (const entry of this._entries) {
        if (entry.ignored) continue;
        if (entry.status) continue;
        const oldFullPath = `${this.path}/${entry.path}`;
        const basename = entry.path.split("/").pop();
        if (!basename) {
          entry.status = { ok: false, message: "Invalid path" };
          continue;
        }
        const newFullPath = `${this.moveConfig.targetPath}/${basename}`;
        try {
          if (!(await exists(oldFullPath))) {
            entry.status = { ok: false, message: "Not found" };
            continue;
          }
          await rename(oldFullPath, newFullPath);
          entry.status = { ok: true };
        } catch (e) {
          entry.status = { ok: false, message: String(e) };
        }
      }
    } finally {
      this._state = "done";
    }
  }

  // --- Private methods ---

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
        this._moveTargetError = String(e);
      }
    }, 300);
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
    this.debounceTimer = setTimeout(() => void this._runScan(currentId), 300);
  }

  private async _runScan(currentId: number) {
    this._state = "scanning";

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
      this._entries = entries;
      this._pathError = "";
    } catch (e) {
      if (currentId !== this.requestId) return;
      this._pathError = String(e);
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
            result.push({ path: entryRelPath, isFile: true, ignored: false });
            entryWillBeDeleted = true;
          }
        }
      }

      if (!isSystem && !entryWillBeDeleted) allWillBeDeleted = false;

      if (++this._scanCount % 200 === 0) {
        this._scanned = rootResult.length;
        this._entries = [...rootResult];
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (requestId !== this.requestId) return false;
      }
    }

    return allWillBeDeleted;
  }
}
