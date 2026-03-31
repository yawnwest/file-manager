import { readDir, remove } from "@tauri-apps/plugin-fs";

const SYSTEM_FILES = new Set([
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

export class EmptyFolderCleaner {
  path = $state("");
  private _pathError = $state("");
  readonly pathIsValid = $derived(!this._pathError);

  private _emptyFolders: string[] = $state([]);

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
      await remove(`${this.path}/${folder}`, { recursive: true });
    }
    this._scan();
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
        const entries = await readDir(this.path);

        if (currentId !== this.requestId) return;

        const emptyFolders: string[] = [];
        for (const entry of entries) {
          if (!entry.isDirectory) continue;
          const subEntries = await readDir(`${this.path}/${entry.name}`);
          if (subEntries.every((e) => SYSTEM_FILES.has(e.name))) {
            emptyFolders.push(entry.name);
          }
        }

        if (currentId !== this.requestId) return;

        this._emptyFolders = emptyFolders.sort((a, b) => a.localeCompare(b));
        this._pathError = "";
      } catch (e) {
        if (currentId !== this.requestId) return;

        this._emptyFolders = [];
        this._pathError = String(e);
      }
    }, 300);
  }
}
