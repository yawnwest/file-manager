import { invoke } from "@tauri-apps/api/core";
import { SYSTEM_FILES } from "$lib/constants";

export type FolderStatus = "deleted" | "failed" | "skipped";

export interface Folder {
  path: string;
  status?: FolderStatus;
  statusText: string;
}

export class EmptyFolderCleaner {
  path = $state("");
  private _pathError = $state("");
  readonly pathIsValid = $derived(!this._pathError);

  private _folders: Folder[] = $state([]);
  emptyCount = $state(0);
  skippedCount = $state(0);
  scanChecked = $state(0);
  private _scanCount = 0;
  scanning = $state(false);
  deleting = $state(false);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  readonly cleanup: () => void;

  get pathError() {
    return this._pathError;
  }

  get folders() {
    return this._folders;
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
      for (const folder of this._folders) {
        if (folder.status === "skipped") continue;
        try {
          const fullPath = `${this.path}/${folder.path}`;
          const realEntries = await this._getRealEntries(fullPath);
          if (realEntries.length > 0) {
            folder.status = "failed";
            folder.statusText = "Directory is no longer empty";
            continue;
          }
          await invoke("remove_empty_dir", { path: fullPath });
          folder.status = "deleted";
          folder.statusText = "Deletion successful";
        } catch (e) {
          folder.status = "failed";
          folder.statusText = String(e);
        }
      }
    } finally {
      this.deleting = false;
    }
  }

  private async _getRealEntries(fullPath: string) {
    const entries = await invoke<Array<{ name: string; isDirectory: boolean; isFile: boolean }>>("read_dir", {
      path: fullPath,
    });
    return entries.filter((e) => !SYSTEM_FILES.has(e.name));
  }

  private _scan() {
    if (!this.path) {
      this._folders = [];
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
        const folders: Folder[] = [];
        this._scanCount = 0;
        this.emptyCount = 0;
        this.skippedCount = 0;
        await this._scanDir("", currentId, folders);

        if (currentId !== this.requestId) return;

        this._folders = folders.sort((a, b) => {
          const depthDiff = b.path.split("/").length - a.path.split("/").length;
          return depthDiff !== 0 ? depthDiff : a.path.localeCompare(b.path);
        });
        this._pathError = "";
      } catch (e) {
        if (currentId !== this.requestId) return;

        this._folders = [];
        this._pathError = String(e);
      } finally {
        if (currentId === this.requestId) this.scanning = false;
      }
    }, 300);
  }

  private async _scanDir(relPath: string, requestId: number, result: Folder[]): Promise<boolean> {
    if (requestId !== this.requestId) return false;

    if (++this._scanCount % 50 === 0) {
      this.scanChecked = this._scanCount;
      this._folders = [...result];
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (requestId !== this.requestId) return false;
    }

    const fullPath = relPath ? `${this.path}/${relPath}` : this.path;
    const realEntries = await this._getRealEntries(fullPath);

    if (realEntries.length === 0) {
      if (relPath) {
        result.push({ path: relPath, statusText: "" });
        this.emptyCount++;
      }
      return true;
    }

    let allEmpty = true;
    for (const entry of realEntries) {
      if (requestId !== this.requestId) return false;
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
        result.push({ path: childRelPath, status: "skipped", statusText: String(e) });
        this.skippedCount++;
      }
      if (!childEmpty) allEmpty = false;
    }

    if (allEmpty && relPath) {
      result.push({ path: relPath, statusText: "" });
      this.emptyCount++;
    }
    return allEmpty;
  }
}
