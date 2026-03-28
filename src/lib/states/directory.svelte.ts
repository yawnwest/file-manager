import { readDir } from "@tauri-apps/plugin-fs";

export class Directory {
  path = $state("");

  private _files: string[] = $state([]);
  private _error = $state("");

  private requestId = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  get files() {
    return this._files;
  }

  get error() {
    return this._error;
  }

  constructor() {
    $effect(() => {
      const path = this.path;

      if (!path) {
        this._files = [];
        this._error = "";
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

          this._files = entries
            .filter((entry) => entry.isFile)
            .map((entry) => entry.name);

          this._error = "";
        } catch (e) {
          if (currentId !== this.requestId) return;
          this._files = [];
          this._error = String(e);
        }
      }, 300);
    });
  }
}
