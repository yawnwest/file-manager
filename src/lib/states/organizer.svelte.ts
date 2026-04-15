import { readDir, stat, exists, remove, rename } from "@tauri-apps/plugin-fs";
import { SYSTEM_FILES } from "$lib/constants";

export type State = "idle" | "scanning" | "deleting" | "renaming" | "moving";

export type EntryStatus = { ok: true } | { ok: false; message: string };

export interface Entry {
  path: string;
  isFile: boolean;
  ignored: boolean;
  status?: EntryStatus;
}

export interface MoveConfig {
  targetPath: string;
}

export interface RenameConfig {
  matchPattern: string;
  renamePattern: string;
}

export interface FilterConfig {
  extensions: string[];
  includePatterns: string[];
  excludePatterns: string[];
  excludeFiles: boolean;
  excludeFolders: boolean;
  excludeSystemFiles: boolean;
  recursive: boolean;
  isEmpty: boolean;
}

export class Organizer {
  path = $state("");
  filters: FilterConfig = $state({
    extensions: [],
    includePatterns: [],
    excludePatterns: [],
    excludeFiles: false,
    excludeFolders: false,
    excludeSystemFiles: true,
    recursive: false,
    isEmpty: false,
  });
  private _state: State = $state("idle");
  private _pathError = $state("");
  readonly pathIsValid = $derived(!this._pathError);

  moveConfig: MoveConfig = $state({ targetPath: "" });
  private _moveTargetError = $state("");
  readonly moveTargetIsValid = $derived(!this._moveTargetError);

  get moveTargetError() {
    return this._moveTargetError;
  }

  renameConfig: RenameConfig = $state({
    matchPattern: "",
    renamePattern: "",
  });

  readonly renamePatternError = $derived(
    (() => {
      if (!this.renameConfig.matchPattern) return "";
      try {
        new RegExp(this.renameConfig.matchPattern);
        return "";
      } catch (e) {
        return String(e);
      }
    })(),
  );

  private _entries: Entry[] = $state([]);
  readonly entryCount = $derived(this._entries.length);
  readonly deleteCount = $derived(this._entries.filter((e) => !e.ignored).length);
  readonly renameCount = $derived(this._entries.filter((e) => !e.ignored && this.computeNewName(e) !== null).length);
  private _scanned = $state(0);
  private _scanCount = 0;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  readonly cleanup: () => void;

  get state() {
    return this._state;
  }

  get pathError() {
    return this._pathError;
  }

  get entries() {
    return this._entries;
  }

  get scanned() {
    return this._scanned;
  }

  constructor() {
    this.cleanup = $effect.root(() => {
      $effect(() => {
        void this.path;
        void this.filters.extensions.length;
        void this.filters.includePatterns.length;
        void this.filters.excludePatterns.length;
        void this.filters.excludeFiles;
        void this.filters.excludeFolders;
        void this.filters.excludeSystemFiles;
        void this.filters.recursive;
        void this.filters.isEmpty;
        this._scan();
      });
      $effect(() => {
        void this.moveConfig.targetPath;
        this._validateMoveTarget();
      });
    });
  }

  reload() {
    this._scan();
  }

  async deleteAll() {
    this._state = "deleting";
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
    this._state = "idle";
  }

  computeNewName(entry: Entry): string | null {
    if (!this.renameConfig.matchPattern || this.renamePatternError) return null;
    return applyRename(
      entry.path.split("/").pop()!,
      entry.isFile,
      this.renameConfig.matchPattern,
      this.renameConfig.renamePattern,
    );
  }

  async renameAll() {
    this._state = "renaming";
    for (const entry of this._entries) {
      if (entry.ignored) continue;
      const newName = this.computeNewName(entry);
      if (newName === null) continue;

      const oldFullPath = `${this.path}/${entry.path}`;
      const dir = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/") + 1) : "";
      const newFullPath = `${this.path}/${dir}${newName}`;

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
    this._state = "idle";
  }

  private _validateMoveTarget() {
    if (this._moveDebounceTimer) clearTimeout(this._moveDebounceTimer);
    this._moveDebounceTimer = setTimeout(async () => {
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

  private _moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  async moveAll() {
    this._state = "moving";
    for (const entry of this._entries) {
      if (entry.ignored) continue;
      const oldFullPath = `${this.path}/${entry.path}`;
      const basename = entry.path.split("/").pop()!;
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
    this._state = "idle";
  }

  private _scan() {
    if (!this.path) {
      this._pathError = "";
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      const currentId = ++this.requestId;
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
    }, 300);
  }

  // Returns true if all non-system children of this directory would be deleted,
  // i.e. the directory would become empty after the operation.
  private async _scanDir(relPath: string, requestId: number, result: Entry[]): Promise<boolean> {
    if (requestId !== this.requestId) return false;

    if (++this._scanCount % 50 === 0) {
      this._scanned = this._scanCount;
      this._entries = [...result];
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (requestId !== this.requestId) return false;
    }

    const fullPath = relPath ? `${this.path}/${relPath}` : this.path;
    const realEntries = await readDir(fullPath);

    let allWillBeDeleted = true;

    for (const entry of realEntries) {
      if (requestId !== this.requestId) return false;

      const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      const entryFullPath = `${this.path}/${entryRelPath}`;
      const isSystem = SYSTEM_FILES.has(entry.name);
      let entryWillBeDeleted = false;

      if (!entry.isFile) {
        // Recurse first into a local buffer so we can determine childrenWouldBeEmpty
        // before deciding whether to include the folder itself. The folder entry must
        // still be pushed BEFORE its children so that deleteAll (which reverses the
        // list) processes children before their parent.
        const subResult: Entry[] = [];
        let childrenWouldBeEmpty = false;

        if (this.filters.recursive) {
          const childrenExcluded = this.filters.excludePatterns.some((p) => globToRegex(p).test(entryRelPath + "/_"));
          if (!childrenExcluded) {
            childrenWouldBeEmpty = await this._scanDir(entryRelPath, requestId, subResult);
            if (requestId !== this.requestId) return false;
          }
        }

        if (matchesFilters(entryRelPath, false, this.filters)) {
          let passes = !this.filters.isEmpty;
          if (!passes) {
            const currentlyEmpty = await isEntryEmpty(entryFullPath, false);
            passes = currentlyEmpty || childrenWouldBeEmpty;
          }
          if (passes) {
            result.push({ path: entryRelPath, isFile: false, ignored: false }); // folder before its children
            entryWillBeDeleted = true;
          }
        }

        result.push(...subResult);
      } else {
        if (matchesFilters(entryRelPath, true, this.filters)) {
          if (!this.filters.isEmpty || (await isEntryEmpty(entryFullPath, true))) {
            result.push({ path: entryRelPath, isFile: true, ignored: false });
            entryWillBeDeleted = true;
          }
        }
      }

      // System files don't count towards emptiness (consistent with isEntryEmpty)
      if (!isSystem && !entryWillBeDeleted) allWillBeDeleted = false;
    }

    return allWillBeDeleted;
  }
}

async function isEntryEmpty(fullPath: string, isFile: boolean): Promise<boolean> {
  if (isFile) {
    const info = await stat(fullPath);
    return (info.size ?? 0) === 0;
  } else {
    const children = await readDir(fullPath);
    return children.every((c) => SYSTEM_FILES.has(c.name));
  }
}

function applyRename(name: string, isFile: boolean, matchPattern: string, renamePattern: string): string | null {
  let regex: RegExp;
  try {
    regex = new RegExp(matchPattern);
  } catch {
    return null;
  }

  const match = regex.exec(name);
  if (!match) return null;

  const groups = match.groups ?? {};
  let newStem = renamePattern;
  for (const [key, value] of Object.entries(groups)) {
    newStem = newStem.replaceAll(`$<${key}>`, value ?? "");
  }

  if (isFile) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot) : "";
    return newStem + ext;
  }
  return newStem;
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
}

function matchesFilters(relPath: string, isFile: boolean, f: FilterConfig): boolean {
  if (f.excludeFiles && isFile) return false;
  if (f.excludeFolders && !isFile) return false;

  const name = relPath.split("/").pop()!;

  if (f.excludeSystemFiles && SYSTEM_FILES.has(name)) return false;

  if (f.extensions.length > 0 && isFile) {
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
    if (!f.extensions.some((e) => e.toLowerCase() === ext)) return false;
  }

  if (f.includePatterns.length > 0) {
    if (!f.includePatterns.some((p) => globToRegex(p).test(relPath))) return false;
  }

  if (f.excludePatterns.length > 0) {
    if (f.excludePatterns.some((p) => globToRegex(p).test(relPath))) return false;
  }

  return true;
}
