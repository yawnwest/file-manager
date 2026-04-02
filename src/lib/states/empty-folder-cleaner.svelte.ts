import { readDir, remove } from "@tauri-apps/plugin-fs";
import { SYSTEM_FILES } from "$lib/constants";

interface EmptyFolder {
  path: string;
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
      try {
        const fullPath = `${this.path}/${folder.path}`;
        const realEntries = await this._getRealEntries(fullPath);
        if (realEntries.length > 0) {
          folder.deleteError = "Directory is no longer empty";
          continue;
        }
        await remove(fullPath, { recursive: true });
        folder.deleteError = "";
      } catch (e) {
        folder.deleteError = String(e);
      }
    }

    this._emptyFolders = this._emptyFolders.filter((f) => f.deleteError !== "");
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

        this._emptyFolders = emptyFolders.sort((a, b) => {
          const depthDiff = b.path.split("/").length - a.path.split("/").length;
          return depthDiff !== 0 ? depthDiff : a.path.localeCompare(b.path);
        });
        this._pathError = "";
      } catch (e) {
        if (currentId !== this.requestId) return;

        this._emptyFolders = [];
        this._pathError = String(e);
      }
    }, 300);
  }

  private async _getRealEntries(fullPath: string) {
    const entries = await readDir(fullPath);
    return entries.filter((e) => !SYSTEM_FILES.has(e.name));
  }

  private async _scanDir(relPath: string, requestId: number, result: EmptyFolder[]): Promise<boolean> {
    if (requestId !== this.requestId) return false;

    const fullPath = relPath ? `${this.path}/${relPath}` : this.path;
    const realEntries = await this._getRealEntries(fullPath);

    if (realEntries.length === 0) {
      if (relPath) result.push({ path: relPath, deleteError: "" });
      return true;
    }

    let allEmpty = true;
    for (const entry of realEntries) {
      if (!entry.isDirectory) {
        allEmpty = false;
        continue;
      }
      const childRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      const childEmpty = await this._scanDir(childRelPath, requestId, result);
      if (!childEmpty) allEmpty = false;
    }

    if (allEmpty && relPath) {
      result.push({ path: relPath, deleteError: "" });
    }
    return allEmpty;
  }
}
