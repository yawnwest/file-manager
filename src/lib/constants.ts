export const SYSTEM_FILES = new Set([
  ".DS_Store", // macOS folder metadata
  ".localized", // macOS folder localization marker
  ".Spotlight-V100", // macOS Spotlight index on external volumes
  ".fseventsd", // macOS FSEvents log on external volumes
  ".Trashes", // macOS volume trash
  "Thumbs.db", // Windows thumbnail cache
  "desktop.ini", // Windows folder settings
]);

export const VIDEO_EXTENSIONS = [
  "3gp",
  "avi",
  "asf",
  "flv",
  "m2ts",
  "m2v",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mp4v",
  "mpg",
  "mpeg",
  "mts",
  "ogv",
  "ogg",
  "ts",
  "webm",
  "wmv",
] as const;

export function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > 0 ? path.slice(dot + 1).toLowerCase() : "";
}

export function isVideoPath(path: string): boolean {
  return VIDEO_EXTENSIONS.includes(getExtension(path) as (typeof VIDEO_EXTENSIONS)[number]);
}
