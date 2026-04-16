import { SYSTEM_FILES } from "$lib/constants";
import { readDir, stat } from "@tauri-apps/plugin-fs";
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

export function applyRename(name: string, isFile: boolean, matchPattern: string, renamePattern: string): string | null {
  let regex: RegExp;
  try {
    regex = new RegExp(matchPattern);
  } catch {
    return null;
  }

  const match = regex.exec(name);
  if (!match) return null;

  const groups = match.groups ?? {};
  let newStem = renamePattern;
  for (const [key, value] of Object.entries(groups)) {
    newStem = newStem.replaceAll(`$<${key}>`, value ?? "");
  }

  if (isFile) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot) : "";
    return newStem + ext;
  }
  return newStem;
}

export function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
}

export function matchesFilters(relPath: string, isFile: boolean, f: FilterConfig): boolean {
  if (f.excludeFiles && isFile) return false;
  if (f.excludeFolders && !isFile) return false;

  const name = relPath.split("/").pop()!;

  if (f.excludeSystemFiles && SYSTEM_FILES.has(name)) return false;

  if (f.extensions.length > 0 && isFile) {
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
    if (!f.extensions.some((e) => e.toLowerCase() === ext)) return false;
  }

  if (f.includePatterns.length > 0) {
    if (!f.includePatterns.some((p) => globToRegex(p).test(relPath))) return false;
  }

  if (f.excludePatterns.length > 0) {
    if (f.excludePatterns.some((p) => globToRegex(p).test(relPath))) return false;
  }

  return true;
}
