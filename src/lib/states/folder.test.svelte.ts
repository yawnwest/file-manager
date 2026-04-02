import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DirEntry } from "@tauri-apps/plugin-fs";
import { Folder } from "./folder.svelte.js";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  rename: vi.fn(),
}));

const { readDir, rename } = await import("@tauri-apps/plugin-fs");
const mockReadDir = vi.mocked(readDir);
const mockRename = vi.mocked(rename);

// Resolved: .then() + .finally() = 2 ticks
// Rejected: skip .then() + .catch() + .finally() = 3 ticks
async function flushPromises(ticks = 2) {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

describe("Folder", () => {
  let folder: Folder;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    cleanup = $effect.root(() => {
      folder = new Folder();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("has empty files and no error initially", () => {
    expect(folder.files).toEqual([]);
    expect(folder.pathError).toBe("");
  });

  it("calls readDir after 300ms debounce", async () => {
    mockReadDir.mockResolvedValue([]);

    folder.path = "/some/path";
    await Promise.resolve();
    expect(mockReadDir).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(mockReadDir).toHaveBeenCalledWith("/some/path");
  });

  it("populates files with isFile entries only", async () => {
    mockReadDir.mockResolvedValue([
      { name: "file.txt", isFile: true },
      { name: "folder", isFile: false },
      { name: "image.png", isFile: true },
    ] as unknown as DirEntry[]);

    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(folder.files.map((f) => f.name)).toEqual(["file.txt", "image.png"]);
    expect(folder.pathError).toBe("");
  });

  it("sets error and clears files on readDir failure", async () => {
    mockReadDir.mockRejectedValue(new Error("Permission denied"));

    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(3);

    expect(folder.files).toEqual([]);
    expect(folder.pathError).toBe("Error: Permission denied");
  });

  it("debounces rapid path changes", async () => {
    mockReadDir.mockResolvedValue([]);

    folder.path = "/path/1";
    await Promise.resolve();
    vi.advanceTimersByTime(100);

    folder.path = "/path/2";
    await Promise.resolve();
    vi.advanceTimersByTime(100);

    folder.path = "/path/3";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(mockReadDir).toHaveBeenCalledTimes(1);
    expect(mockReadDir).toHaveBeenCalledWith("/path/3");
  });

  it("clears files and error when path is reset to empty", async () => {
    mockReadDir.mockResolvedValue([{ name: "file.txt", isFile: true }] as unknown as DirEntry[]);

    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(folder.files.map((f) => f.name)).toEqual(["file.txt"]);

    folder.path = "";
    await Promise.resolve();

    expect(folder.files).toEqual([]);
    expect(folder.pathError).toBe("");
  });

  it("ignores stale responses from superseded requests", async () => {
    let resolveFirst!: (v: DirEntry[]) => void;
    mockReadDir
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          }),
      )
      .mockResolvedValueOnce([{ name: "second.txt", isFile: true }] as unknown as DirEntry[]);

    // First request starts, stays pending
    folder.path = "/path/1";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(mockReadDir).toHaveBeenCalledWith("/path/1");

    // Second request starts and resolves
    folder.path = "/path/2";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(folder.files.map((f) => f.name)).toEqual(["second.txt"]);

    // First request resolves late — should be ignored
    resolveFirst([{ name: "first.txt", isFile: true, isDirectory: false, isSymlink: false }]);
    await flushPromises();
    expect(folder.files.map((f) => f.name)).toEqual(["second.txt"]);
  });

  it("sorts files alphabetically", async () => {
    mockReadDir.mockResolvedValue([
      { name: "zebra.txt", isFile: true },
      { name: "apple.txt", isFile: true },
      { name: "mango.txt", isFile: true },
    ] as unknown as DirEntry[]);

    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(folder.files.map((f) => f.name)).toEqual(["apple.txt", "mango.txt", "zebra.txt"]);
  });

  it("filters system files when ignoreSystemFiles is true", async () => {
    mockReadDir.mockResolvedValue([
      { name: ".DS_Store", isFile: true },
      { name: ".hidden", isFile: true },
      { name: "visible.txt", isFile: true },
    ] as unknown as DirEntry[]);

    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(folder.files.map((f) => f.name)).toEqual(["visible.txt"]);
  });

  it("shows system files when ignoreSystemFiles is false", async () => {
    mockReadDir.mockResolvedValue([
      { name: ".DS_Store", isFile: true },
      { name: "visible.txt", isFile: true },
    ] as unknown as DirEntry[]);

    folder.ignoreSystemFiles = false;
    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(folder.files.map((f) => f.name)).toEqual([".DS_Store", "visible.txt"]);
  });

  it("filters files by fileFilterPattern regex", async () => {
    mockReadDir.mockResolvedValue([
      { name: "01.mp3", isFile: true },
      { name: "02.mp3", isFile: true },
      { name: "notes.txt", isFile: true },
    ] as unknown as DirEntry[]);

    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    folder.fileFilterPattern = "\\.mp3$";
    await Promise.resolve();

    expect(folder.files.map((f) => f.name)).toEqual(["01.mp3", "02.mp3"]);
  });

  it("shows all files when fileFilterPattern is invalid regex", async () => {
    mockReadDir.mockResolvedValue([
      { name: "a.txt", isFile: true },
      { name: "b.txt", isFile: true },
    ] as unknown as DirEntry[]);

    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    folder.fileFilterPattern = "[invalid";
    await Promise.resolve();

    expect(folder.files.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
  });

  it("extracts groupNames from fileNamePattern", async () => {
    folder.fileNamePattern = "(?<number>\\d+)_(?<title>.+)\\.mp3";
    await Promise.resolve();

    expect(folder.groupNames).toEqual(["name", "base", "ext", "number", "title"]);
  });

  it("includes only built-in groups when fileNamePattern has no named groups", async () => {
    folder.fileNamePattern = "\\d+\\.mp3";
    await Promise.resolve();

    expect(folder.groupNames).toEqual(["name", "base", "ext"]);
  });

  it("computes newName for files matching the pattern", async () => {
    mockReadDir.mockResolvedValue([{ name: "01.track.mp3", isFile: true }] as unknown as DirEntry[]);

    folder.fileNamePattern = "(?<number>\\d\\d)\\..*";
    folder.newFileNamePattern = "$<number> - $<base>.$<ext>";
    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(4);

    expect(folder.files[0].newName).toBe("01 - 01.track.mp3");
    expect(folder.files[0].matchError).toBe(false);
  });

  it("sets matchError when file does not match fileNamePattern", async () => {
    mockReadDir.mockResolvedValue([{ name: "no-number.mp3", isFile: true }] as unknown as DirEntry[]);

    folder.fileNamePattern = "(?<number>\\d\\d)\\..*";
    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(4);

    expect(folder.files[0].matchError).toBe(true);
  });

  it("skips newName computation for ignored files", async () => {
    mockReadDir.mockResolvedValue([{ name: "01.track.mp3", isFile: true }] as unknown as DirEntry[]);

    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(4);

    folder.files[0].ignore = true;
    await Promise.resolve();

    expect(folder.files[0].newName).toBe("");
  });

  it("uses overridePattern per file instead of global newFileNamePattern", async () => {
    mockReadDir.mockResolvedValue([{ name: "01.track.mp3", isFile: true }] as unknown as DirEntry[]);

    folder.fileNamePattern = "(?<number>\\d\\d)\\..*";
    folder.newFileNamePattern = "$<number>.default.mp3";
    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(4);

    folder.files[0].overridePattern = "$<number>.custom.mp3";
    await Promise.resolve();

    expect(folder.files[0].newName).toBe("01.custom.mp3");
  });

  it("renameAll renames matching files and reloads", async () => {
    mockReadDir.mockResolvedValue([{ name: "01.track.mp3", isFile: true }] as unknown as DirEntry[]);
    mockRename.mockResolvedValue(undefined);

    folder.fileNamePattern = "(?<number>\\d\\d)\\..*";
    folder.newFileNamePattern = "$<number>.new.mp3";
    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(4);

    mockReadDir.mockResolvedValue([{ name: "01.new.mp3", isFile: true }] as unknown as DirEntry[]);

    await folder.renameAll();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(mockRename).toHaveBeenCalledWith("/some/path/01.track.mp3", "/some/path/01.new.mp3");
    expect(folder.files.map((f) => f.name)).toEqual(["01.new.mp3"]);
  });

  it("renameAll sets renameError when target name already exists", async () => {
    mockReadDir.mockResolvedValue([
      { name: "01.track.mp3", isFile: true },
      { name: "01.new.mp3", isFile: true },
    ] as unknown as DirEntry[]);

    folder.fileNamePattern = "(?<number>\\d\\d)\\..*";
    folder.newFileNamePattern = "$<number>.new.mp3";
    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(4);

    await folder.renameAll();

    const file = folder.files.find((f) => f.name === "01.track.mp3")!;
    expect(file.renameError).toBe('"01.new.mp3" already exists');
    expect(mockRename).not.toHaveBeenCalled();
  });

  it("renameAll skips ignored files", async () => {
    mockReadDir.mockResolvedValue([{ name: "01.track.mp3", isFile: true }] as unknown as DirEntry[]);

    folder.fileNamePattern = "(?<number>\\d\\d)\\..*";
    folder.newFileNamePattern = "$<number>.new.mp3";
    folder.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(4);

    folder.files[0].ignore = true;
    await Promise.resolve();

    await folder.renameAll();

    expect(mockRename).not.toHaveBeenCalled();
  });
});
