import { readDir, rename } from "@tauri-apps/plugin-fs";
import { File } from "$lib/states/file.svelte";

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

export class Directory {
  // Path
  path = $state("");
  private _pathError = $state("");
  readonly pathIsValid = $derived(!this._pathError);

  // Files
  ignoreSystemFiles = $state(true);
  fileFilterPattern = $state("");
  private _allFiles: File[] = $state([]);
  readonly files = $derived.by(() => {
    let result = this.ignoreSystemFiles
      ? this._allFiles.filter(
          (f) => !SYSTEM_FILES.has(f.name) && !f.name.startsWith("."),
        )
      : this._allFiles;
    if (this.fileFilterPattern) {
      try {
        const regex = new RegExp(this.fileFilterPattern);
        result = result.filter((f) => regex.test(f.name));
      } catch {
        // invalid pattern — show all
      }
    }
    return result;
  });
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  // Rename
  fileNamePattern = $state("(?<number>\\d\\d)\\..*");
  private readonly _parsedFileNamePattern = $derived.by(() => {
    if (!this.fileNamePattern) return null;
    try {
      return new RegExp(this.fileNamePattern);
    } catch {
      return null;
    }
  });
  newFileNamePattern = $state("$<number>.ignore.txt");
  private readonly _groupNames = $derived([
    "name",
    "base",
    "ext",
    ...[...this.fileNamePattern.matchAll(/\(\?<([^>]+)>/g)].map((m) => m[1]),
  ]);

  // Lifecycle
  readonly cleanup: () => void;

  get pathError() {
    return this._pathError;
  }

  get groupNames() {
    return this._groupNames;
  }

  constructor() {
    this.cleanup = $effect.root(() => {
      $effect(() => {
        void this.path;
        this._readDir();
      });
      $effect(() => {
        void this.files;
        void this.fileNamePattern;
        void this.newFileNamePattern;
        this._updateNewFileNames();
      });
    });
  }

  reload() {
    this._readDir();
  }

  async renameAll() {
    const pendingRenames = this.files.filter(
      (f) => !f.ignore && !f.matchError && f.newName && f.newName !== f.name,
    );

    let errors = false;
    for (const file of pendingRenames) {
      file.renameError = "";
      if (this._allFiles.some((f) => f.name === file.newName)) {
        errors = true;
        file.renameError = `"${file.newName}" already exists`;
        continue;
      }
      try {
        await rename(
          `${this.path}/${file.name}`,
          `${this.path}/${file.newName}`,
        );
        file.name = file.newName;
      } catch (e) {
        errors = true;
        file.renameError = String(e);
      }
    }
    if (!errors) {
      this._readDir();
    } else {
      this._updateNewFileNames();
    }
  }

  private _readDir() {
    if (!this.path) {
      this._allFiles = [];
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

        this._allFiles = entries
          .filter((entry) => entry.isFile)
          .map((entry) => new File(entry.name))
          .sort((fileA, fileB) => fileA.name.localeCompare(fileB.name));
        this._pathError = "";
      } catch (e) {
        if (currentId !== this.requestId) return;

        this._allFiles = [];
        this._pathError = String(e);
      }
    }, 300);
  }

  private _updateNewFileNames() {
    for (const file of this.files) {
      this._updateNewFileName(file);
    }
  }

  private _updateNewFileName(file: File) {
    if (file.ignore) {
      file.newName = "";
      return;
    }

    const { base, ext } = this._splitFileName(file.name);
    const vars: Record<string, string> = {
      name: file.name,
      base,
      ext,
    };

    const newPattern = file.overridePattern || this.newFileNamePattern;
    const regex = this._parsedFileNamePattern;

    const resolve = (groups: Record<string, string> = {}) =>
      newPattern.replace(
        /\$<(\w+)>/g,
        (m, key) => ({ ...vars, ...groups })[key] ?? m,
      );

    if (regex) {
      const match = regex.exec(file.name);
      file.matchError = !match;
      file.newName = resolve(match?.groups ?? {});
    } else {
      file.matchError = false;
      file.newName = resolve();
    }
  }

  private _splitFileName(fileName: string): { base: string; ext: string } {
    const dot = fileName.lastIndexOf(".");
    if (dot <= 0) return { base: fileName, ext: "" };
    return { base: fileName.slice(0, dot), ext: fileName.slice(dot + 1) };
  }
}
