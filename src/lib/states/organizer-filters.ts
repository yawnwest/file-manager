import { SYSTEM_FILES } from "$lib/constants";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import type { FilterConfig } from "./organizer-types";

export async function isEntryEmpty(fullPath: string, isFile: boolean): Promise<boolean> {
  try {
    if (isFile) {
      const info = await stat(fullPath);
      return (info.size ?? 0) === 0;
    } else {
      const children = await readDir(fullPath);
      return children.every((c) => SYSTEM_FILES.has(c.name));
    }
  } catch {
    return false;
  }
}

export function globToRegex(pattern: string): RegExp | null {
  // gitignore semantics:
  // - No '/' in pattern → match against basename (anywhere in path)
  // - Leading '/' → anchor to root
  // - '/' elsewhere → match against full relative path
  let p = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;

  const hasLeadingSlash = p.startsWith("/");
  if (hasLeadingSlash) p = p.slice(1);

  const matchFilenameOnly = !hasLeadingSlash && !p.includes("/");

  const escaped = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  let regexStr = escaped
    .replace(/\*\*/g, "\x00")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\x00\//g, "([^/]+/)*")
    .replace(/\/\x00/g, "(/.*)?")
    .replace(/\x00/g, ".*");

  if (matchFilenameOnly) regexStr = `(.*\/)?${regexStr}`;

  try {
    return new RegExp(`^${regexStr}$`);
  } catch {
    return null;
  }
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

  if (compiled.include.length > 0) {
    if (!compiled.include.some((r) => r.test(relPath))) return false;
  }

  if (compiled.exclude.length > 0) {
    if (compiled.exclude.some((r) => r.test(relPath))) return false;
  }

  return true;
}
