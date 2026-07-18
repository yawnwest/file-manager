import { isVideoPath } from "$lib/constants";
import type { Entry } from "./organizer-types";

/**
 * Applies a rename pattern to a filename using named capture groups.
 *
 * Placeholders in `renamePattern` of the form `$<groupName>` are replaced
 * with the corresponding named capture group value from the regex match.
 * For files, the original extension is preserved. Returns `null` if the
 * regex does not match.
 *
 * @example
 * // Regex: /(?<year>\d{4})-(?<month>\d{2})/
 * // renamePattern: "$<month>_$<year>"
 * applyRename("2024-03.txt", true, regex, "$<month>_$<year>") // "03_2024.txt"
 */
export function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join("-");
}

export function applyRename(
  name: string,
  isFile: boolean,
  regex: RegExp,
  renamePattern: string,
  duration: string = "",
): string | null {
  const match = regex.exec(name);
  if (!match) return null;

  const dot = isFile ? name.lastIndexOf(".") : -1;
  const ext = dot > 0 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;

  const groups = match.groups ?? {};
  let newStem = renamePattern.replaceAll("$<filename>", base);
  const requiresLength = renamePattern.includes("$<length>");
  if (requiresLength) {
    if (!isFile || !isVideoPath(name)) return null;
    if (!duration) return null;
  }
  newStem = newStem.replaceAll("$<length>", `[[${duration}]]`);
  for (const [key, value] of Object.entries(groups)) {
    if (key === "length") continue;
    newStem = newStem.replaceAll(`$<${key}>`, value ?? "");
  }
  newStem = newStem.replace(/[/\\]/g, "_").replace(/\0/g, "");

  if (isFile) {
    if (ext && newStem.endsWith(ext)) {
      return newStem;
    }
    return newStem + ext;
  }
  return newStem;
}

/**
 * Computes the new name for an entry based on a regex and rename pattern.
 *
 * Extracts the filename from `entry.path` and delegates to `applyRename`.
 * Returns `null` if `regex` is `null` or the path has no filename component.
 */
export function computeNewName(
  entry: Entry,
  regex: RegExp | null,
  renamePattern: string,
  duration: string = "",
): string | null {
  if (!regex) return null;
  const filename = entry.path.split("/").pop();
  if (!filename) return null;
  return applyRename(filename, entry.isFile, regex, renamePattern, duration);
}
