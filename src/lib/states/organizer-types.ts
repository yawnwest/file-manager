export type State = "idle" | "scanning" | "deleting" | "renaming" | "moving" | "done";

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

export interface ScanConfig {
  recursive: boolean;
}

export interface FilterConfig {
  includePatterns: string[];
  excludePatterns: string[];
  excludeFiles: boolean;
  excludeFolders: boolean;
  excludeSystemFiles: boolean;
  isEmpty: boolean;
}
