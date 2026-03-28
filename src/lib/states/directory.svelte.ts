import { readDir } from "@tauri-apps/plugin-fs";
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
  path = $state("");
  private _pathError = $state("");
  readonly pathIsValid = $derived(!this._pathError);
  ignoreSystemFiles = $state(true);
  private _allFiles: File[] = $state([]);
  readonly files = $derived(
    this.ignoreSystemFiles
      ? this._allFiles.filter(
          (f) => !SYSTEM_FILES.has(f.name) && !f.name.startsWith("."),
        )
      : this._allFiles,
  );
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
  private _groupNames: string[] = $state([]);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;
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
        void this.fileNamePattern;
        this._updateGroupNames();
      });
      $effect(() => {
        void this.files;
        void this.fileNamePattern;
        void this.newFileNamePattern;
        this._updateNewFileNames();
      });
    });
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

  private _updateGroupNames() {
    this._groupNames = [
      "name",
      "base",
      "ext",
      ...[...this.fileNamePattern.matchAll(/\(\?<([^>]+)>/g)].map((m) => m[1]),
    ];
  }

  private _updateNewFileNames() {
    for (const file of this.files) {
      this.updateNewFileName(file);
    }
  }

  private updateNewFileName(file: File) {
    if (file.ignore) {
      file.newName = "";
      return;
    }

    const { base, ext } = this.splitFileName(file.name);
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

    file.newName = regex
      ? file.name.replace(regex, (_, ...args) =>
          resolve(args.at(-1) as Record<string, string>),
        )
      : resolve();
  }

  private splitFileName(fileName: string): { base: string; ext: string } {
    const dot = fileName.lastIndexOf(".");
    if (dot <= 0) return { base: fileName, ext: "" };
    return { base: fileName.slice(0, dot), ext: fileName.slice(dot + 1) };
  }
}
