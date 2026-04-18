import type { Entry } from "./organizer-types";

export function applyRename(name: string, isFile: boolean, regex: RegExp, renamePattern: string): string | null {
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

export function computeNewName(entry: Entry, regex: RegExp | null, renamePattern: string): string | null {
  if (!regex) return null;
  const filename = entry.path.split("/").pop();
  if (!filename) return null;
  return applyRename(filename, entry.isFile, regex, renamePattern);
}
