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

  // ── Initial state ────────────────────────────────────────────────────────────

  it("has empty folders, no error, and is valid initially", () => {
    expect(cleaner.folders).toEqual([]);
    expect(cleaner.pathError).toBe("");
    expect(cleaner.pathIsValid).toBe(true);
  });

  // ── Debounce & path changes ──────────────────────────────────────────────────

  it("scans after 300ms debounce", async () => {
    mockReadDir([]);

    cleaner.path = "/base";
    await Promise.resolve();
    expect(mockInvoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("read_dir", { path: "/base" });
  });

  it("debounce resets when path changes within 300ms", async () => {
    mockReadDir([]);

    cleaner.path = "/first";
    await Promise.resolve();
    vi.advanceTimersByTime(200);

    cleaner.path = "/second";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("read_dir", { path: "/second" });
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

  it("reload triggers a new scan with the current path", async () => {
    mockReadDir([]);
    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();
    vi.clearAllMocks();

    mockReadDir([]);
    cleaner.reload();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("read_dir", { path: "/base" });
  });

  // ── Folder detection ─────────────────────────────────────────────────────────

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

  it("detects nested empty folders and includes the parent", async () => {
    mockReadDir([{ name: "parent", isDirectory: true }], [{ name: "child", isDirectory: true }], []);

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(cleaner.folders.map((f) => f.path)).toEqual(["parent/child", "parent"]);
  });

  it("sorts results deepest first, then alphabetically within the same depth", async () => {
    mockReadDir(
      [
        { name: "alpha", isDirectory: true },
        { name: "beta", isDirectory: true },
      ],
      [{ name: "nested", isDirectory: true }],
      [],
      [],
    );

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(20);

    expect(cleaner.folders.map((f) => f.path)).toEqual(["alpha/nested", "alpha", "beta"]);
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

  // ── Scan state & errors ──────────────────────────────────────────────────────

  it("sets scanning to true during scan and false after", async () => {
    mockReadDir([]);

    cleaner.path = "/base";
    await Promise.resolve();
    vi.advanceTimersByTime(300);

    expect(cleaner.scanning).toBe(true);
    await flushPromises();
    expect(cleaner.scanning).toBe(false);
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

  it("pathIsValid is false after a scan error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("not found"));

    cleaner.path = "/bad";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(3);

    expect(cleaner.pathIsValid).toBe(false);
  });

  // ── deleteAll ────────────────────────────────────────────────────────────────

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

    it("sets deleting to true during deletion and false after", async () => {
      await scanOneEmptyFolder();
      mockReadDir([]);
      mockRemoveDir();

      const promise = cleaner.deleteAll();
      expect(cleaner.deleting).toBe(true);
      await promise;
      expect(cleaner.deleting).toBe(false);
    });

    it("skips folders with status skipped", async () => {
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
      vi.clearAllMocks();

      mockReadDir([]);
      mockRemoveDir();

      await cleaner.deleteAll();

      expect(mockInvoke).toHaveBeenCalledWith("remove_empty_dir", { path: "/base/accessible" });
      expect(mockInvoke).not.toHaveBeenCalledWith("remove_empty_dir", { path: "/base/restricted" });
    });

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
