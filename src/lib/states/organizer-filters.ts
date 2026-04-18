import { SYSTEM_FILES } from "$lib/constants";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import safeRegex from "safe-regex2";
import type { FilterConfig } from "./organizer-types";

export async function isEntryEmpty(fullPath: string, isFile: boolean): Promise<boolean> {
  if (isFile) {
    const info = await stat(fullPath);
    return (info.size ?? 0) === 0;
  } else {
    const children = await readDir(fullPath);
    return children.every((c) => SYSTEM_FILES.has(c.name));
  }
}

export function globToRegex(pattern: string): RegExp | null {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
  return safeRegex(regex) ? regex : null;
}

export function matchesFilters(
  relPath: string,
  isFile: boolean,
  f: FilterConfig,
  compiled: { include: RegExp[]; exclude: RegExp[] },
): boolean {
  if (f.excludeFiles && isFile) return false;
  if (f.excludeFolders && !isFile) return false;

  const name = relPath.split("/").pop()!;

  if (f.excludeSystemFiles && SYSTEM_FILES.has(name)) return false;

  if (f.extensions.length > 0 && isFile) {
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
    if (!f.extensions.some((e) => e.toLowerCase() === ext)) return false;
  }

  if (compiled.include.length > 0) {
    if (!compiled.include.some((r) => r.test(relPath))) return false;
  }

  if (compiled.exclude.length > 0) {
    if (compiled.exclude.some((r) => r.test(relPath))) return false;
  }

  return true;
}
