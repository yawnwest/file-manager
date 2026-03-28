import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Directory } from "./directory.svelte.js";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
}));

const { readDir } = await import("@tauri-apps/plugin-fs");
const mockReadDir = vi.mocked(readDir);

// Resolved: .then() + .finally() = 2 ticks
// Rejected: skip .then() + .catch() + .finally() = 3 ticks
async function flushPromises(ticks = 2) {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

describe("Directory", () => {
  let dir: Directory;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    cleanup = $effect.root(() => {
      dir = new Directory();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("has empty files and no error initially", () => {
    expect(dir.files).toEqual([]);
    expect(dir.error).toBe("");
  });

  it("calls readDir after 300ms debounce", async () => {
    mockReadDir.mockResolvedValue([]);

    dir.path = "/some/path";
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
    ] as any);

    dir.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(dir.files).toEqual(["file.txt", "image.png"]);
    expect(dir.error).toBe("");
  });

  it("sets error and clears files on readDir failure", async () => {
    mockReadDir.mockRejectedValue(new Error("Permission denied"));

    dir.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises(3);

    expect(dir.files).toEqual([]);
    expect(dir.error).toBe("Error: Permission denied");
  });

  it("debounces rapid path changes", async () => {
    mockReadDir.mockResolvedValue([]);

    dir.path = "/path/1";
    await Promise.resolve();
    vi.advanceTimersByTime(100);

    dir.path = "/path/2";
    await Promise.resolve();
    vi.advanceTimersByTime(100);

    dir.path = "/path/3";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(mockReadDir).toHaveBeenCalledTimes(1);
    expect(mockReadDir).toHaveBeenCalledWith("/path/3");
  });

  it("clears files and error when path is reset to empty", async () => {
    mockReadDir.mockResolvedValue([{ name: "file.txt", isFile: true }] as any);

    dir.path = "/some/path";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(dir.files).toEqual(["file.txt"]);

    dir.path = "";
    await Promise.resolve();

    expect(dir.files).toEqual([]);
    expect(dir.error).toBe("");
  });

  it("ignores stale responses from superseded requests", async () => {
    let resolveFirst!: (v: any) => void;
    mockReadDir
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          }),
      )
      .mockResolvedValueOnce([{ name: "second.txt", isFile: true }] as any);

    // First request starts, stays pending
    dir.path = "/path/1";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(mockReadDir).toHaveBeenCalledWith("/path/1");

    // Second request starts and resolves
    dir.path = "/path/2";
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(dir.files).toEqual(["second.txt"]);

    // First request resolves late — should be ignored
    resolveFirst([{ name: "first.txt", isFile: true }]);
    await flushPromises();
    expect(dir.files).toEqual(["second.txt"]);
  });
});
