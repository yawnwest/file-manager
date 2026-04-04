import { invoke } from "@tauri-apps/api/core";
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
  private _skippedFolders: { path: string; reason: string }[] = $state([]);
  scanning = $state(false);
  deleting = $state(false);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  readonly cleanup: () => void;

  get pathError() {
    return this._pathError;
  }

  get emptyFolders() {
    return this._emptyFolders;
  }

  get skippedFolders() {
    return this._skippedFolders;
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
    this.deleting = true;
    try {
      for (const folder of this._emptyFolders) {
        try {
          const fullPath = `${this.path}/${folder.path}`;
          const realEntries = await this._getRealEntries(fullPath);
          if (realEntries.length > 0) {
            folder.deleteError = "Directory is no longer empty";
            continue;
          }
          await invoke("remove_empty_dir", { path: fullPath });
          folder.deleteError = "";
        } catch (e) {
          folder.deleteError = String(e);
        }
      }

      this._emptyFolders = this._emptyFolders.filter((f) => f.deleteError !== "");
    } finally {
      this.deleting = false;
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
      this.scanning = true;

      try {
        const emptyFolders: EmptyFolder[] = [];
        this._skippedFolders = [];
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
      } finally {
        if (currentId === this.requestId) this.scanning = false;
      }
    }, 300);
  }

  private async _getRealEntries(fullPath: string) {
    const entries = await invoke<Array<{ name: string; isDirectory: boolean; isFile: boolean }>>("read_dir", {
      path: fullPath,
    });
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
      let childEmpty: boolean;
      try {
        childEmpty = await this._scanDir(childRelPath, requestId, result);
      } catch (e) {
        childEmpty = false;
        this._skippedFolders.push({ path: childRelPath, reason: String(e) });
      }
      if (!childEmpty) allEmpty = false;
    }

    if (allEmpty && relPath) {
      result.push({ path: relPath, deleteError: "" });
    }
    return allEmpty;
  }
}
