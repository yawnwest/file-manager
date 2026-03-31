import { readDir, remove } from "@tauri-apps/plugin-fs";
import { SvelteSet } from "svelte/reactivity";

const SYSTEM_FILES = new SvelteSet([
  // macOS
  ".DS_Store",
  ".localized",
  ".Spotlight-V100",
  ".fseventsd",
  ".Trashes",
  // Windows
  "Thumbs.db",
  "desktop.ini",
]);

interface EmptyFolder {
  path: string;
  isCascade: boolean;
  deleteError: string;
}

export class EmptyFolderCleaner {
  path = $state("");
  private _pathError = $state("");
  readonly pathIsValid = $derived(!this._pathError);

  private _emptyFolders: EmptyFolder[] = $state([]);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  readonly cleanup: () => void;

  get pathError() {
    return this._pathError;
  }

  get emptyFolders() {
    return this._emptyFolders;
  }

  constructor() {
    this.cleanup = $effect.root(() => {
      $effect(() => {
        void this.path;
        this._scan();
      });
    });
  }

  reload() {
    this._scan();
  }

  async deleteAll() {
    for (const folder of this._emptyFolders) {
      folder.deleteError = "";
    }

    for (const folder of this._emptyFolders) {
      try {
        await remove(`${this.path}/${folder.path}`, { recursive: true });
        await this._cascadeDelete(folder.path);
      } catch (e) {
        folder.deleteError = String(e);
      }
    }

    this._scan();
  }

  private async _cascadeDelete(folderPath: string) {
    const parts = folderPath.split("/");
    if (parts.length <= 1) return;

    const parentPath = parts.slice(0, -1).join("/");
    try {
      const parentEntries = await readDir(`${this.path}/${parentPath}`);
      if (parentEntries.every((e) => SYSTEM_FILES.has(e.name))) {
        await remove(`${this.path}/${parentPath}`, { recursive: true });
        await this._cascadeDelete(parentPath);
      }
    } catch {
      // Parent already deleted or inaccessible
    }
  }

  private _scan() {
    if (!this.path) {
      this._emptyFolders = [];
      this._pathError = "";
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      const currentId = ++this.requestId;

      try {
        const emptyFolders: EmptyFolder[] = [];
        await this._scanDir("", currentId, emptyFolders);

        if (currentId !== this.requestId) return;

        await this._findCascadeParents(emptyFolders);

        if (currentId !== this.requestId) return;

        this._emptyFolders = emptyFolders.sort((a, b) => a.path.localeCompare(b.path));
        this._pathError = "";
      } catch (e) {
        if (currentId !== this.requestId) return;

        this._emptyFolders = [];
        this._pathError = String(e);
      }
    }, 300);
  }

  private async _findCascadeParents(result: EmptyFolder[]) {
    const allEmptyPaths = new SvelteSet(result.map((f) => f.path));
    let changed = true;
    while (changed) {
      changed = false;
      const parentPaths = new SvelteSet<string>();
      for (const path of allEmptyPaths) {
        const parts = path.split("/");
        if (parts.length > 1) parentPaths.add(parts.slice(0, -1).join("/"));
      }
      for (const parentPath of parentPaths) {
        if (allEmptyPaths.has(parentPath)) continue;
        const parentEntries = await readDir(`${this.path}/${parentPath}`);
        const realEntries = parentEntries.filter((e) => !SYSTEM_FILES.has(e.name));
        if (realEntries.every((e) => allEmptyPaths.has(`${parentPath}/${e.name}`))) {
          allEmptyPaths.add(parentPath);
          result.push({ path: parentPath, isCascade: true, deleteError: "" });
          changed = true;
        }
      }
    }
  }

  private async _scanDir(relPath: string, requestId: number, result: EmptyFolder[]) {
    if (requestId !== this.requestId) return;

    const fullPath = relPath ? `${this.path}/${relPath}` : this.path;
    const entries = await readDir(fullPath);

    for (const entry of entries) {
      if (!entry.isDirectory || SYSTEM_FILES.has(entry.name)) continue;

      const childRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      const childEntries = await readDir(`${this.path}/${childRelPath}`);

      if (childEntries.every((e) => SYSTEM_FILES.has(e.name))) {
        result.push({ path: childRelPath, isCascade: false, deleteError: "" });
      } else {
        await this._scanDir(childRelPath, requestId, result);
      }
    }
  }
}
