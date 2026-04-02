import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DirEntry } from "@tauri-apps/plugin-fs";
import { EmptyFolderCleaner } from "./empty-folder-cleaner.svelte.js";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  remove: vi.fn(),
}));

const { readDir, remove } = await import("@tauri-apps/plugin-fs");
const mockReadDir = vi.mocked(readDir);
const mockRemove = vi.mocked(remove);

async function flushPromises(ticks = 10) {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

describe("EmptyFolderCleaner", () => {
  let cleaner: EmptyFolderCleaner;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    cleanup = $effect.root(() => {
      cleaner = new EmptyFolderCleaner();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("has empty folders and no error initially", () => {
    expect(cleaner.emptyFolders).toEqual([]);
    expect(cleaner.pathError).toBe("");
  });

  it("scans after 300ms debounce", async () => {
    mockReadDir.mockResolvedValue([]);

    cleaner.path = "/base";
    await Promise.resolve();
    expect(mockReadDir).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(mockReadDir).toHaveBeenCalledWith("/base");
  });

  it("detects a directly empty subfolder", async () => {
    mockReadDir
      .mockResolvedValueOnce([{ name: "empty-dir", isDirectory: true }] as unknown as DirEntry[])
      .mockResolvedValueOnce([]);

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(cleaner.emptyFolders.map((f) => f.path)).toEqual(["empty-dir"]);
    expect(cleaner.pathError).toBe("");
  });

  it("does not include folders that contain files", async () => {
    mockReadDir
      .mockResolvedValueOnce([{ name: "non-empty", isDirectory: true }] as unknown as DirEntry[])
      .mockResolvedValueOnce([{ name: "file.txt", isFile: true }] as unknown as DirEntry[]);

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(cleaner.emptyFolders).toEqual([]);
  });

  it("treats folders containing only system files as empty", async () => {
    mockReadDir
      .mockResolvedValueOnce([{ name: "sys-only", isDirectory: true }] as unknown as DirEntry[])
      .mockResolvedValueOnce([
        { name: ".DS_Store", isFile: true },
        { name: "Thumbs.db", isFile: true },
      ] as unknown as DirEntry[]);

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(cleaner.emptyFolders.map((f) => f.path)).toEqual(["sys-only"]);
  });

  it("sets error and clears folders on readDir failure", async () => {
    mockReadDir.mockRejectedValue(new Error("Permission denied"));

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(3);

    expect(cleaner.emptyFolders).toEqual([]);
    expect(cleaner.pathError).toBe("Error: Permission denied");
  });

  it("clears folders and error when path is reset to empty", async () => {
    mockReadDir
      .mockResolvedValueOnce([{ name: "empty-dir", isDirectory: true }] as unknown as DirEntry[])
      .mockResolvedValueOnce([]);

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(cleaner.emptyFolders).toHaveLength(1);

    cleaner.path = "";
    await Promise.resolve();

    expect(cleaner.emptyFolders).toEqual([]);
    expect(cleaner.pathError).toBe("");
  });

  describe("deleteAll", () => {
    async function scanOneEmptyFolder() {
      mockReadDir
        .mockResolvedValueOnce([{ name: "empty-dir", isDirectory: true }] as unknown as DirEntry[])
        .mockResolvedValueOnce([]);

      cleaner.path = "/base";
      await Promise.resolve();
      vi.advanceTimersByTime(300);
      await flushPromises();

      expect(cleaner.emptyFolders).toHaveLength(1);
      vi.clearAllMocks();
    }

    it("deletes the folder when it is still empty", async () => {
      await scanOneEmptyFolder();
      mockReadDir.mockResolvedValue([]);
      mockRemove.mockResolvedValue(undefined);

      await cleaner.deleteAll();

      expect(mockReadDir).toHaveBeenCalledWith("/base/empty-dir");
      expect(mockRemove).toHaveBeenCalledWith("/base/empty-dir", { recursive: true });
      expect(cleaner.emptyFolders).toHaveLength(0);
    });

    it("deletes the folder when it contains only system files", async () => {
      await scanOneEmptyFolder();
      mockReadDir.mockResolvedValue([{ name: ".DS_Store", isFile: true }] as unknown as DirEntry[]);
      mockRemove.mockResolvedValue(undefined);

      await cleaner.deleteAll();

      expect(mockRemove).toHaveBeenCalledWith("/base/empty-dir", { recursive: true });
      expect(cleaner.emptyFolders).toHaveLength(0);
    });

    it("skips deletion and sets error when folder is no longer empty", async () => {
      await scanOneEmptyFolder();
      mockReadDir.mockResolvedValue([{ name: "new-file.txt", isFile: true }] as unknown as DirEntry[]);

      await cleaner.deleteAll();

      expect(mockRemove).not.toHaveBeenCalled();
      expect(cleaner.emptyFolders[0].deleteError).toBe("Directory is no longer empty");
    });

    it("sets deleteError when remove fails", async () => {
      await scanOneEmptyFolder();
      mockReadDir.mockResolvedValue([]);
      mockRemove.mockRejectedValue(new Error("Permission denied"));

      await cleaner.deleteAll();

      expect(cleaner.emptyFolders[0].deleteError).toBe("Error: Permission denied");
    });

    it("processes all folders even if one fails the pre-deletion check", async () => {
      mockReadDir
        .mockResolvedValueOnce([
          { name: "dir-a", isDirectory: true },
          { name: "dir-b", isDirectory: true },
        ] as unknown as DirEntry[])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      cleaner.path = "/base";
      await Promise.resolve();
      vi.advanceTimersByTime(300);
      await flushPromises(12);

      expect(cleaner.emptyFolders).toHaveLength(2);
      vi.clearAllMocks();

      mockReadDir
        .mockResolvedValueOnce([{ name: "new-file.txt", isFile: true }] as unknown as DirEntry[])
        .mockResolvedValueOnce([]);
      mockRemove.mockResolvedValue(undefined);

      await cleaner.deleteAll();

      expect(cleaner.emptyFolders).toHaveLength(1);
      expect(cleaner.emptyFolders[0].path).toBe("dir-a");
      expect(cleaner.emptyFolders[0].deleteError).toBe("Directory is no longer empty");
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
  });
});
