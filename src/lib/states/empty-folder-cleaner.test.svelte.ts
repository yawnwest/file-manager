import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EmptyFolderCleaner } from "./empty-folder-cleaner.svelte.js";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const { invoke } = await import("@tauri-apps/api/core");
const mockInvoke = vi.mocked(invoke);

type Entry = { name: string; isDirectory?: boolean; isFile?: boolean };

function mockReadDir(...results: Entry[][]) {
  for (const result of results) {
    mockInvoke.mockResolvedValueOnce(result);
  }
}

function mockRemoveDir() {
  mockInvoke.mockResolvedValueOnce(undefined);
}

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
    expect(cleaner.folders).toEqual([]);
    expect(cleaner.pathError).toBe("");
  });

  it("scans after 300ms debounce", async () => {
    mockReadDir([]);

    cleaner.path = "/base";
    await Promise.resolve();
    expect(mockInvoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("read_dir", { path: "/base" });
  });

  it("detects a directly empty subfolder", async () => {
    mockReadDir([{ name: "empty-dir", isDirectory: true }], []);

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(cleaner.folders.map((f) => f.path)).toEqual(["empty-dir"]);
    expect(cleaner.pathError).toBe("");
  });

  it("does not include folders that contain files", async () => {
    mockReadDir([{ name: "non-empty", isDirectory: true }], [{ name: "file.txt", isFile: true }]);

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(cleaner.folders).toEqual([]);
  });

  it("treats folders containing only system files as empty", async () => {
    mockReadDir(
      [{ name: "sys-only", isDirectory: true }],
      [
        { name: ".DS_Store", isFile: true },
        { name: "Thumbs.db", isFile: true },
      ],
    );

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(cleaner.folders.map((f) => f.path)).toEqual(["sys-only"]);
  });

  it("sets error and clears folders on read_dir failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Permission denied"));

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(3);

    expect(cleaner.folders).toEqual([]);
    expect(cleaner.pathError).toBe("Error: Permission denied");
  });

  it("clears folders and error when path is reset to empty", async () => {
    mockReadDir([{ name: "empty-dir", isDirectory: true }], []);

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(cleaner.folders).toHaveLength(1);

    cleaner.path = "";
    await Promise.resolve();

    expect(cleaner.folders).toEqual([]);
    expect(cleaner.pathError).toBe("");
  });

  it("skips inaccessible subfolders and records them", async () => {
    mockReadDir(
      [
        { name: "accessible", isDirectory: true },
        { name: "restricted", isDirectory: true },
      ],
      [],
    );
    mockInvoke.mockRejectedValueOnce(new Error("Permission denied"));

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(cleaner.folders.filter((f) => !f.status).map((f) => f.path)).toEqual(["accessible"]);
    expect(cleaner.folders.filter((f) => f.status === "skipped")).toEqual([
      { path: "restricted", status: "skipped", statusText: "Error: Permission denied" },
    ]);
  });

  describe("deleteAll", () => {
    async function scanOneEmptyFolder() {
      mockReadDir([{ name: "empty-dir", isDirectory: true }], []);

      cleaner.path = "/base";
      await Promise.resolve();
      vi.advanceTimersByTime(300);
      await flushPromises();

      expect(cleaner.folders).toHaveLength(1);
      vi.clearAllMocks();
    }

    it("deletes the folder when it is still empty", async () => {
      await scanOneEmptyFolder();
      mockReadDir([]);
      mockRemoveDir();

      await cleaner.deleteAll();

      expect(mockInvoke).toHaveBeenCalledWith("read_dir", { path: "/base/empty-dir" });
      expect(mockInvoke).toHaveBeenCalledWith("remove_empty_dir", { path: "/base/empty-dir" });
      expect(cleaner.folders.filter((f) => !f.status)).toHaveLength(0);
    });

    it("deletes the folder when it contains only system files", async () => {
      await scanOneEmptyFolder();
      mockReadDir([{ name: ".DS_Store", isFile: true }]);
      mockRemoveDir();

      await cleaner.deleteAll();

      expect(mockInvoke).toHaveBeenCalledWith("remove_empty_dir", { path: "/base/empty-dir" });
      expect(cleaner.folders.filter((f) => !f.status)).toHaveLength(0);
    });

    it("skips deletion and sets error when folder is no longer empty", async () => {
      await scanOneEmptyFolder();
      mockReadDir([{ name: "new-file.txt", isFile: true }]);

      await cleaner.deleteAll();

      expect(mockInvoke).not.toHaveBeenCalledWith("remove_empty_dir", expect.anything());
      expect(cleaner.folders[0].status).toBe("failed");
      expect(cleaner.folders[0].statusText).toBe("Directory is no longer empty");
    });

    it("sets statusText when remove_empty_dir fails", async () => {
      await scanOneEmptyFolder();
      mockReadDir([]);
      mockInvoke.mockRejectedValueOnce(new Error("Permission denied"));

      await cleaner.deleteAll();

      expect(cleaner.folders[0].status).toBe("failed");
      expect(cleaner.folders[0].statusText).toBe("Error: Permission denied");
    });

    it("processes all folders even if one fails the pre-deletion check", async () => {
      mockReadDir(
        [
          { name: "dir-a", isDirectory: true },
          { name: "dir-b", isDirectory: true },
        ],
        [],
        [],
      );

      cleaner.path = "/base";
      await Promise.resolve();
      vi.advanceTimersByTime(300);
      await flushPromises(12);

      expect(cleaner.folders).toHaveLength(2);
      vi.clearAllMocks();

      mockReadDir([{ name: "new-file.txt", isFile: true }], []);
      mockRemoveDir();

      await cleaner.deleteAll();

      const failed = cleaner.folders.filter((f) => f.status === "failed");
      expect(failed).toHaveLength(1);
      expect(failed[0].path).toBe("dir-a");
      expect(failed[0].statusText).toBe("Directory is no longer empty");
      expect(mockInvoke).toHaveBeenCalledWith("remove_empty_dir", { path: "/base/dir-b" });
    });
  });
});
