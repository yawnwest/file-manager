// @vitest-environment jsdom
import { flushSync, tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  stat: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
}));

vi.mock("./organizer-filters", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./organizer-filters")>();
  return { ...mod, isEntryEmpty: vi.fn() };
});

import { readDir, stat } from "@tauri-apps/plugin-fs";
import { isEntryEmpty } from "./organizer-filters";
import { Organizer } from "./organizer.svelte";

const mockStat = vi.mocked(stat);
const mockReadDir = vi.mocked(readDir);
const mockIsEntryEmpty = vi.mocked(isEntryEmpty);

type FakeDirEntry = Awaited<ReturnType<typeof readDir>>[number];

function file(name: string): FakeDirEntry {
  return { name, isFile: true, isDirectory: false, isSymlink: false };
}

function folder(name: string): FakeDirEntry {
  return { name, isFile: false, isDirectory: true, isSymlink: false };
}

const DIRECTORY = { isDirectory: true } as Awaited<ReturnType<typeof stat>>;
const REGULAR_FILE = { isDirectory: false } as Awaited<ReturnType<typeof stat>>;

describe("Organizer", () => {
  let organizer: Organizer;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mockStat.mockResolvedValue(DIRECTORY);
    mockReadDir.mockResolvedValue([]);
    mockIsEntryEmpty.mockResolvedValue(false);
    organizer = new Organizer();
    await tick();
  });

  afterEach(() => {
    organizer.cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  async function drainAsync(ms = 300) {
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 20; i++) await tick();
  }

  async function triggerScan(path = "/test") {
    organizer.path = path;
    await tick(); // let $effect run
    await drainAsync();
  }

  describe("renamePatternError", () => {
    it("is empty with no match pattern", () => {
      expect(organizer.renamePatternError).toBe("");
    });

    it("is empty for a valid regex", () => {
      organizer.renameConfig.matchPattern = "(\\w+)";
      flushSync();
      expect(organizer.renamePatternError).toBe("");
    });

    it("reports syntax error for invalid regex", () => {
      organizer.renameConfig.matchPattern = "[invalid";
      flushSync();
      expect(organizer.renamePatternError).not.toBe("");
    });

    it("reports unsafe patterns", () => {
      organizer.renameConfig.matchPattern = "(a+)+";
      flushSync();
      expect(organizer.renamePatternError).toBe("Pattern may cause performance issues");
    });
  });

  describe("isExecuting", () => {
    it("is false when idle", () => {
      expect(organizer.isExecuting).toBe(false);
    });
  });

  describe("scan", () => {
    it("starts with empty entries and idle state", () => {
      expect(organizer.entries).toEqual([]);
      expect(organizer.state).toBe("idle");
    });

    it("sets pathError when stat throws", async () => {
      mockStat.mockRejectedValue(new Error("no such file"));
      await triggerScan();
      expect(organizer.pathError).toBe("Error: no such file");
      expect(organizer.entries).toEqual([]);
    });

    it("sets pathError when path is not a directory", async () => {
      mockStat.mockResolvedValue(REGULAR_FILE);
      await triggerScan();
      expect(organizer.pathError).toBe("Path is not a directory");
    });

    it("clears pathError on subsequent successful scan", async () => {
      mockStat.mockRejectedValueOnce(new Error("fail"));
      await triggerScan("/bad");
      expect(organizer.pathError).not.toBe("");

      mockStat.mockResolvedValue(DIRECTORY);
      await triggerScan("/good");
      expect(organizer.pathError).toBe("");
    });

    it("populates entries from readDir", async () => {
      mockReadDir.mockResolvedValue([file("foo.txt"), folder("bar")]);
      await triggerScan();
      expect(organizer.entries).toEqual([
        { path: "foo.txt", isFile: true, ignored: false },
        { path: "bar", isFile: false, ignored: false },
      ]);
    });

    it("state is idle after scan completes", async () => {
      await triggerScan();
      expect(organizer.state).toBe("idle");
    });

    it("excludes files when excludeFiles is set", async () => {
      organizer.filters.excludeFiles = true;
      mockReadDir.mockResolvedValue([file("foo.txt"), folder("bar")]);
      await triggerScan();
      expect(organizer.entries.map((e) => e.path)).toEqual(["bar"]);
    });

    it("excludes folders when excludeFolders is set", async () => {
      organizer.filters.excludeFolders = true;
      mockReadDir.mockResolvedValue([file("foo.txt"), folder("bar")]);
      await triggerScan();
      expect(organizer.entries.map((e) => e.path)).toEqual(["foo.txt"]);
    });

    it("filters by include pattern", async () => {
      organizer.filters.includePatterns = ["*.ts"];
      mockReadDir.mockResolvedValue([file("foo.ts"), file("bar.js")]);
      await triggerScan();
      expect(organizer.entries.map((e) => e.path)).toEqual(["foo.ts"]);
    });

    it("filters out excluded patterns", async () => {
      organizer.filters.excludePatterns = ["*.tmp"];
      mockReadDir.mockResolvedValue([file("foo.ts"), file("bar.tmp")]);
      await triggerScan();
      expect(organizer.entries.map((e) => e.path)).toEqual(["foo.ts"]);
    });

    it("excludes system files by default", async () => {
      mockReadDir.mockResolvedValue([file(".DS_Store"), file("foo.txt")]);
      await triggerScan();
      expect(organizer.entries.map((e) => e.path)).toEqual(["foo.txt"]);
    });

    it("includes system files when excludeSystemFiles is off", async () => {
      organizer.filters.excludeSystemFiles = false;
      mockReadDir.mockResolvedValue([file(".DS_Store"), file("foo.txt")]);
      await triggerScan();
      expect(organizer.entries.map((e) => e.path)).toContain(".DS_Store");
    });

    it("filters to only empty files when isEmpty is set", async () => {
      organizer.filters.isEmpty = true;
      mockReadDir.mockResolvedValue([file("empty.txt"), file("full.txt")]);
      mockIsEntryEmpty.mockImplementation(async (path) => String(path).includes("empty"));
      await triggerScan();
      expect(organizer.entries.map((e) => e.path)).toEqual(["empty.txt"]);
    });

    it("entryCount and activeCount reflect all entries", async () => {
      mockReadDir.mockResolvedValue([file("a.txt"), file("b.txt"), folder("c")]);
      await triggerScan();
      expect(organizer.entryCount).toBe(3);
      expect(organizer.activeCount).toBe(3);
    });
  });

  describe("recursive scan", () => {
    it("includes nested entries with relative paths", async () => {
      organizer.scanConfig.recursive = true;
      mockReadDir.mockResolvedValueOnce([folder("sub")]).mockResolvedValueOnce([file("nested.txt")]);
      await triggerScan();
      expect(organizer.entries.map((e) => e.path)).toContain("sub/nested.txt");
    });

    it("does not recurse into excluded directories", async () => {
      organizer.scanConfig.recursive = true;
      organizer.filters.excludePatterns = ["node_modules"];
      mockReadDir
        .mockResolvedValueOnce([folder("node_modules"), file("index.ts")])
        .mockResolvedValueOnce([file("inside.ts")]);
      await triggerScan();
      expect(organizer.entries.map((e) => e.path)).not.toContain("node_modules/inside.ts");
    });
  });

  describe("reload()", () => {
    it("triggers an immediate scan bypassing the debounce", async () => {
      organizer.path = "/test";
      await tick(); // let $effect run
      await vi.advanceTimersByTimeAsync(100); // debounce not yet fired

      mockReadDir.mockResolvedValue([file("a.txt")]);
      organizer.reload();
      await drainAsync(0);

      expect(organizer.entries).toHaveLength(1);
      expect(organizer.entries[0].path).toBe("a.txt");
    });
  });

  describe("moveTargetIsValid", () => {
    async function setMoveTarget(path: string) {
      organizer.moveConfig.targetPath = path;
      await tick();
      await drainAsync();
    }

    it("is true when targetPath is empty", async () => {
      await setMoveTarget("");
      expect(organizer.moveTargetIsValid).toBe(true);
    });

    it("is true when targetPath points to a directory", async () => {
      await setMoveTarget("/some/dir");
      expect(organizer.moveTargetIsValid).toBe(true);
    });

    it("is false when targetPath points to a file", async () => {
      mockStat.mockResolvedValue(REGULAR_FILE);
      await setMoveTarget("/some/file.txt");
      expect(organizer.moveTargetIsValid).toBe(false);
      expect(organizer.moveTargetError).toBe("Path is not a directory");
    });

    it("is false and sets error when stat throws", async () => {
      mockStat.mockRejectedValue(new Error("not found"));
      await setMoveTarget("/nonexistent");
      expect(organizer.moveTargetIsValid).toBe(false);
      expect(organizer.moveTargetError).not.toBe("");
    });
  });
});
