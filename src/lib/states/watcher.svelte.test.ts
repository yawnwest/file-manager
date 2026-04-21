// @vitest-environment jsdom
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  stat: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  watch: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { exists, readDir, stat, watch } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { Watcher } from "./watcher.svelte";

const mockStat = vi.mocked(stat);
const mockReadDir = vi.mocked(readDir);
const mockExists = vi.mocked(exists);
const mockWatch = vi.mocked(watch);
const mockInvoke = vi.mocked(invoke);

type FakeDirEntry = Awaited<ReturnType<typeof readDir>>[number];

function fileEntry(name: string): FakeDirEntry {
  return { name, isFile: true, isDirectory: false, isSymlink: false };
}

const DIRECTORY = { isDirectory: true, isFile: false, size: 0 } as Awaited<ReturnType<typeof stat>>;
const FILE = { isDirectory: false, isFile: true, size: 1024 } as Awaited<ReturnType<typeof stat>>;

describe("Watcher", () => {
  let watcher: Watcher;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mockStat.mockResolvedValue(DIRECTORY);
    mockExists.mockResolvedValue(true);
    mockReadDir.mockResolvedValue([]);
    mockWatch.mockResolvedValue(vi.fn());
    mockInvoke.mockResolvedValue(undefined);
    watcher = new Watcher();
    await tick();
  });

  afterEach(() => {
    watcher.cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  // Advances past debounce (300ms) + _waitUntilStable (3 polls × 250ms)
  async function drainAsync(ms = 1500) {
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 30; i++) await tick();
  }

  async function setPath(path = "/test") {
    watcher.path = path;
    await tick();
    await drainAsync();
  }

  describe("path validation", () => {
    it("sets pathError when stat throws", async () => {
      mockStat.mockRejectedValue(new Error("no such file"));
      await setPath();
      expect(watcher.pathError).toBe("no such file");
    });

    it("sets pathError when path is not a directory", async () => {
      mockStat.mockResolvedValue(FILE);
      await setPath();
      expect(watcher.pathError).toBe("Path is not a directory");
    });

    it("clears pathError on subsequent valid path", async () => {
      mockStat.mockRejectedValueOnce(new Error("fail"));
      await setPath("/bad");
      expect(watcher.pathError).not.toBe("");

      mockStat.mockResolvedValue(DIRECTORY);
      await setPath("/good");
      expect(watcher.pathError).toBe("");
    });

    it("clears pathError when path is emptied", async () => {
      mockStat.mockRejectedValueOnce(new Error("fail"));
      await setPath("/bad");
      await setPath("");
      expect(watcher.pathError).toBe("");
    });

    it("pathIsValid is false when there is a path error", async () => {
      mockStat.mockRejectedValue(new Error("fail"));
      await setPath();
      expect(watcher.pathIsValid).toBe(false);
    });
  });

  describe("ffmpeg check", () => {
    it("sets ffmpegError when check_ffmpeg fails", async () => {
      mockInvoke.mockRejectedValue(new Error("ffmpeg not found"));
      await setPath();
      expect(watcher.ffmpegError).toBe("ffmpeg not found");
    });

    it("does not start watching when ffmpeg is missing", async () => {
      mockInvoke.mockRejectedValue(new Error("ffmpeg not found"));
      await setPath();
      expect(watcher.watching).toBe(false);
    });

    it("starts watching when ffmpeg is available", async () => {
      await setPath();
      expect(watcher.watching).toBe(true);
    });

    it("clears ffmpegError when ffmpeg becomes available", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("not found"));
      await setPath("/a");
      expect(watcher.ffmpegError).not.toBe("");

      mockInvoke.mockResolvedValue(undefined);
      await setPath("/b");
      expect(watcher.ffmpegError).toBe("");
    });

    it("clears ffmpegError when path is cleared", async () => {
      mockInvoke.mockRejectedValue(new Error("not found"));
      await setPath("/a");
      expect(watcher.ffmpegError).not.toBe("");

      await setPath("");
      expect(watcher.ffmpegError).toBe("");
    });
  });

  describe("state reset on path change", () => {
    it("clears log when path changes", async () => {
      await setPath("/a");
      watcher.log.push({
        id: 0,
        filename: "old.mp4",
        filePath: "/a/rotate_left/old.mp4",
        operation: "rotate_left",
        status: "done",
      });
      await setPath("/b");
      expect(watcher.log).toEqual([]);
    });

    it("stops watching when path is cleared", async () => {
      await setPath("/test");
      expect(watcher.watching).toBe(true);

      await setPath("");
      expect(watcher.watching).toBe(false);
    });
  });

  describe("initial scan", () => {
    it("enqueues video files found in subfolders", async () => {
      mockStat.mockImplementation((path: string | URL) =>
        Promise.resolve(path.toString().endsWith(".mp4") ? FILE : DIRECTORY),
      );
      mockReadDir.mockImplementation((path: string | URL) =>
        Promise.resolve(path.toString().includes("/rotate_left") ? [fileEntry("clip.mp4")] : []),
      );
      await setPath("/test");
      expect(watcher.log.length).toBe(1);
      expect(watcher.log[0].filename).toBe("clip.mp4");
      expect(watcher.log[0].operation).toBe("rotate_left");
    });

    it("ignores files with non-video extensions", async () => {
      mockReadDir.mockImplementation((path: string | URL) =>
        Promise.resolve(path.toString().includes("/fix") ? [fileEntry("document.pdf")] : []),
      );
      await setPath("/test");
      expect(watcher.log.length).toBe(0);
    });

    it("ignores system files", async () => {
      mockReadDir.mockImplementation((path: string | URL) =>
        Promise.resolve(path.toString().includes("/fix") ? [fileEntry(".DS_Store")] : []),
      );
      await setPath("/test");
      expect(watcher.log.length).toBe(0);
    });

    it("does not enqueue a file that disappears during stability polling", async () => {
      mockReadDir.mockImplementation((path: string | URL) =>
        Promise.resolve(path.toString().includes("/rotate_left") ? [fileEntry("clip.mp4")] : []),
      );
      let mp4StatCount = 0;
      mockStat.mockImplementation((path: string | URL) => {
        if (path.toString().includes("clip.mp4")) {
          mp4StatCount++;
          if (mp4StatCount === 1) return Promise.resolve(FILE); // initial check in _onFileCreated
          return Promise.reject(new Error("file gone")); // during _waitUntilStable
        }
        return Promise.resolve(DIRECTORY);
      });
      await setPath("/test");
      expect(watcher.log.length).toBe(0);
    });
  });

  describe("clearFinished", () => {
    function pushEntry(id: number, status: "queued" | "processing" | "done" | "error") {
      watcher.log.push({
        id,
        filename: "test.mp4",
        filePath: "/test/rotate_left/test.mp4",
        operation: "rotate_left",
        status,
      });
    }

    it("removes done entries", () => {
      pushEntry(1, "done");
      watcher.clearFinished();
      expect(watcher.log).toEqual([]);
    });

    it("removes error entries", () => {
      pushEntry(1, "error");
      watcher.clearFinished();
      expect(watcher.log).toEqual([]);
    });

    it("keeps queued entries", () => {
      pushEntry(1, "queued");
      watcher.clearFinished();
      expect(watcher.log.length).toBe(1);
    });

    it("keeps processing entries", () => {
      pushEntry(1, "processing");
      watcher.clearFinished();
      expect(watcher.log.length).toBe(1);
    });

    it("removes only finished entries when mixed", () => {
      pushEntry(1, "queued");
      pushEntry(2, "done");
      pushEntry(3, "processing");
      pushEntry(4, "error");
      watcher.clearFinished();
      const statuses = watcher.log.map((e) => e.status);
      expect(statuses).toContain("queued");
      expect(statuses).toContain("processing");
      expect(statuses).not.toContain("done");
      expect(statuses).not.toContain("error");
    });
  });

  describe("retry", () => {
    function errorEntry() {
      watcher.log.push({
        id: 1,
        filename: "test.mp4",
        filePath: "/test/rotate_left/test.mp4",
        operation: "rotate_left",
        status: "error",
        message: "some error",
      });
      return watcher.log[watcher.log.length - 1];
    }

    it("processes entry when the file still exists", async () => {
      mockStat.mockResolvedValue(FILE);
      const entry = errorEntry();
      await watcher.retry(entry);
      for (let i = 0; i < 20; i++) await tick();
      expect(entry.status).not.toBe("error");
    });

    it("sets error message when file no longer exists", async () => {
      mockStat.mockRejectedValue(new Error("not found"));
      const entry = errorEntry();
      await watcher.retry(entry);
      expect(entry.message).toBe("File no longer exists");
      expect(entry.status).toBe("error");
    });

    it("sets error message when path is not a file", async () => {
      mockStat.mockResolvedValue(DIRECTORY);
      const entry = errorEntry();
      await watcher.retry(entry);
      expect(entry.message).toBe("File no longer exists");
    });

    it("does nothing when entry is not in error state", async () => {
      const entry = errorEntry();
      entry.status = "done" as never;
      const callsBefore = mockStat.mock.calls.length;
      await watcher.retry(entry);
      expect(mockStat.mock.calls.length).toBe(callsBefore);
    });
  });

  describe("cancelCurrent", () => {
    function setupProcessing() {
      mockReadDir.mockImplementation((path: string | URL) =>
        Promise.resolve(path.toString().includes("/rotate_left") ? [fileEntry("clip.mp4")] : []),
      );
      mockStat.mockImplementation((path: string | URL) =>
        Promise.resolve(path.toString().endsWith(".mp4") ? FILE : DIRECTORY),
      );
    }

    it("marks the processing entry as Cancelled", async () => {
      setupProcessing();
      let rejectPV!: (e: Error) => void;
      mockInvoke.mockImplementation((cmd: unknown) => {
        if (cmd === "process_video")
          return new Promise<null>((_, rej) => {
            rejectPV = rej;
          });
        return Promise.resolve(undefined);
      });

      await setPath("/test");

      const entry = watcher.log[0];
      expect(entry.status).toBe("processing");

      await watcher.cancelCurrent();
      rejectPV(new Error("ffmpeg killed"));
      for (let i = 0; i < 20; i++) await tick();

      expect(entry.status).toBe("error");
      expect(entry.message).toBe("Cancelled");
    });

    it("does nothing when nothing is processing", async () => {
      await setPath("/test");
      const callsBefore = mockInvoke.mock.calls.length;
      await watcher.cancelCurrent();
      expect(mockInvoke.mock.calls.length).toBe(callsBefore);
    });
  });
});
