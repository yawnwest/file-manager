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

import { exists, readDir, remove, rename, stat } from "@tauri-apps/plugin-fs";
import { isEntryEmpty } from "./organizer-filters";
import { Organizer } from "./organizer.svelte";

const mockStat = vi.mocked(stat);
const mockReadDir = vi.mocked(readDir);
const mockIsEntryEmpty = vi.mocked(isEntryEmpty);
const mockExists = vi.mocked(exists);
const mockRemove = vi.mocked(remove);

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
      expect(organizer.pathError).toBe("no such file");
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

  describe("deleteAll()", () => {
    beforeEach(async () => {
      mockExists.mockResolvedValue(true);
      mockRemove.mockResolvedValue(undefined);
      mockReadDir.mockResolvedValue([file("a.txt"), file("b.txt")]);
      await triggerScan();
    });

    it("sets state to deleting during execution, then done", async () => {
      let stateWhileDeleting: string | null = null;
      mockRemove.mockImplementation(async () => {
        stateWhileDeleting = organizer.state;
      });
      await organizer.deleteAll();
      expect(stateWhileDeleting).toBe("deleting");
      expect(organizer.state).toBe("done");
    });

    it("marks each entry ok after successful removal", async () => {
      await organizer.deleteAll();
      expect(organizer.entries.every((e) => e.status?.ok === true)).toBe(true);
    });

    it("skips ignored entries", async () => {
      organizer.entries[0].ignored = true;
      await organizer.deleteAll();
      expect(organizer.entries[0].status).toBeUndefined();
      expect(organizer.entries[1].status?.ok).toBe(true);
    });

    it("marks entry Not found when file does not exist", async () => {
      mockExists.mockResolvedValue(false);
      await organizer.deleteAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "Not found" });
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it("marks entry with error message when remove throws", async () => {
      mockRemove.mockRejectedValue(new Error("permission denied"));
      await organizer.deleteAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "permission denied" });
    });

    it("does not start a second execution when already executing", async () => {
      let resolveExists!: (v: boolean) => void;
      mockExists.mockReturnValueOnce(
        new Promise((res) => {
          resolveExists = res;
        }),
      );

      const first = organizer.deleteAll();
      await Promise.resolve();
      await Promise.resolve();
      expect(organizer.state).toBe("deleting");

      await organizer.deleteAll(); // returns early
      expect(mockRemove).not.toHaveBeenCalled();

      resolveExists(false);
      await first;
      expect(organizer.state).toBe("done");
    });

    it("deletes children before parent (reverse order)", async () => {
      organizer.scanConfig.recursive = true;
      mockReadDir.mockResolvedValueOnce([folder("sub")]).mockResolvedValueOnce([file("file.txt")]);
      await triggerScan();

      const deletedPaths: string[] = [];
      mockRemove.mockImplementation(async (path) => {
        deletedPaths.push(path as string);
      });

      await organizer.deleteAll();

      expect(deletedPaths[0]).toBe("/test/sub/file.txt");
      expect(deletedPaths[1]).toBe("/test/sub");
    });

    describe("with isEmpty filter", () => {
      beforeEach(() => {
        organizer.filters.isEmpty = true;
      });

      it("skips a folder that became non-empty since scan", async () => {
        mockReadDir.mockResolvedValue([folder("mydir")]);
        mockIsEntryEmpty.mockResolvedValueOnce(true); // scan: empty → include
        mockIsEntryEmpty.mockResolvedValueOnce(false); // deleteAll: no longer empty
        await triggerScan();

        await organizer.deleteAll();

        expect(mockRemove).not.toHaveBeenCalled();
        expect(organizer.entries[0].status).toEqual({ ok: false, message: "Not empty" });
      });

      it("deletes a folder that is still empty", async () => {
        mockReadDir.mockResolvedValue([folder("mydir")]);
        mockIsEntryEmpty.mockResolvedValue(true);
        await triggerScan();

        await organizer.deleteAll();

        expect(mockRemove).toHaveBeenCalledWith("/test/mydir", { recursive: true });
        expect(organizer.entries[0].status?.ok).toBe(true);
      });

      it("skips a file that became non-empty since scan", async () => {
        mockReadDir.mockResolvedValue([file("was-empty.txt")]);
        mockIsEntryEmpty.mockResolvedValueOnce(true); // scan: empty → include
        mockIsEntryEmpty.mockResolvedValueOnce(false); // deleteAll: no longer empty
        await triggerScan();

        await organizer.deleteAll();

        expect(mockRemove).not.toHaveBeenCalled();
        expect(organizer.entries[0].status).toEqual({ ok: false, message: "Not empty" });
      });

      it("deletes a file that is still empty", async () => {
        mockReadDir.mockResolvedValue([file("empty.txt")]);
        mockIsEntryEmpty.mockResolvedValue(true);
        await triggerScan();

        await organizer.deleteAll();

        expect(mockRemove).toHaveBeenCalledWith("/test/empty.txt", { recursive: true });
        expect(organizer.entries[0].status?.ok).toBe(true);
      });
    });
  });

  describe("renameAll()", () => {
    beforeEach(async () => {
      organizer.renameConfig.matchPattern = "(?<stem>.+)\\.txt";
      organizer.renameConfig.renamePattern = "renamed_$<stem>";
      flushSync();
      vi.mocked(rename).mockResolvedValue(undefined);
      mockReadDir.mockResolvedValue([file("a.txt"), file("b.txt")]);
      await triggerScan();
      // sources exist, targets do not
      mockExists.mockImplementation(async (p) => p === "/test/a.txt" || p === "/test/b.txt");
    });

    it("sets state to renaming during execution, then done", async () => {
      let stateWhileRenaming: string | null = null;
      vi.mocked(rename).mockImplementation(async () => {
        stateWhileRenaming = organizer.state;
      });
      await organizer.renameAll();
      expect(stateWhileRenaming).toBe("renaming");
      expect(organizer.state).toBe("done");
    });

    it("renames matching entries with correct paths", async () => {
      await organizer.renameAll();
      expect(vi.mocked(rename)).toHaveBeenCalledWith("/test/a.txt", "/test/renamed_a.txt");
      expect(vi.mocked(rename)).toHaveBeenCalledWith("/test/b.txt", "/test/renamed_b.txt");
      expect(organizer.entries.every((e) => e.status?.ok === true)).toBe(true);
    });

    it("preserves directory prefix for nested entries", async () => {
      organizer.scanConfig.recursive = true;
      mockReadDir.mockResolvedValueOnce([folder("sub")]).mockResolvedValueOnce([file("c.txt")]);
      await triggerScan();
      mockExists.mockImplementation(async (p) => p === "/test/sub/c.txt");
      await organizer.renameAll();
      expect(vi.mocked(rename)).toHaveBeenCalledWith("/test/sub/c.txt", "/test/sub/renamed_c.txt");
    });

    it("skips ignored entries", async () => {
      organizer.entries[0].ignored = true;
      await organizer.renameAll();
      expect(organizer.entries[0].status).toBeUndefined();
      expect(organizer.entries[1].status?.ok).toBe(true);
    });

    it("skips entries that do not match the regex", async () => {
      mockReadDir.mockResolvedValue([file("a.txt"), file("no-match")]);
      await triggerScan();
      mockExists.mockImplementation(async (p) => p === "/test/a.txt");
      await organizer.renameAll();
      expect(organizer.entries.find((e) => e.path === "no-match")?.status).toBeUndefined();
    });

    it("skips entries where new name equals old name", async () => {
      organizer.renameConfig.matchPattern = ".*";
      organizer.renameConfig.renamePattern = "$<filename>";
      flushSync();
      await organizer.renameAll();
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
    });

    it("marks both entries when two would rename to the same path", async () => {
      // both a.txt and b.txt → same.txt with this pattern
      organizer.renameConfig.matchPattern = "(?<stem>[^.]+)";
      organizer.renameConfig.renamePattern = "same";
      flushSync();
      await organizer.renameAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "Name conflict with another entry" });
      expect(organizer.entries[1].status).toEqual({ ok: false, message: "Name conflict with another entry" });
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
    });

    it("conflict does not block unrelated entries", async () => {
      // a.txt and b.txt conflict (both → same.txt); c.md renames to same.md without conflict
      organizer.renameConfig.matchPattern = "(?<stem>[^.]+)";
      organizer.renameConfig.renamePattern = "same";
      flushSync();
      mockReadDir.mockResolvedValue([file("a.txt"), file("b.txt"), file("c.md")]);
      organizer.reload();
      await drainAsync(0);
      mockExists.mockImplementation(async (p) => ["a.txt", "b.txt", "c.md"].some((f) => String(p).endsWith(`/${f}`)));
      await organizer.renameAll();
      expect(organizer.entries[2].status?.ok).toBe(true);
    });

    it("marks entry Not found when source does not exist", async () => {
      mockExists.mockResolvedValue(false);
      await organizer.renameAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "Not found" });
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
    });

    it("marks entry Already exists when target exists and is not a source path", async () => {
      // both source and non-source target exist
      mockExists.mockResolvedValue(true);
      await organizer.renameAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "Already exists" });
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
    });

    it("allows chain rename where target is itself a source path", async () => {
      // a.txt → renamed_a.txt (target is a source); renamed_a.txt → renamed_renamed_a.txt
      mockReadDir.mockResolvedValue([file("a.txt"), file("renamed_a.txt")]);
      organizer.reload();
      await drainAsync(0);
      mockExists.mockImplementation(async (p) => p === "/test/a.txt" || p === "/test/renamed_a.txt");
      await organizer.renameAll();
      expect(organizer.entries[0].status?.ok).toBe(true);
    });

    it("marks entry with error message when rename throws", async () => {
      vi.mocked(rename).mockRejectedValue(new Error("permission denied"));
      await organizer.renameAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "permission denied" });
    });

    it("does not start a second execution when already executing", async () => {
      let resolveExists!: (v: boolean) => void;
      mockExists.mockReturnValueOnce(
        new Promise((res) => {
          resolveExists = res;
        }),
      );
      const first = organizer.renameAll();
      await Promise.resolve();
      await Promise.resolve();
      expect(organizer.state).toBe("renaming");
      await organizer.renameAll();
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
      resolveExists(false);
      await first;
      expect(organizer.state).toBe("done");
    });
  });

  describe("moveAll()", () => {
    const TARGET = "/target";

    beforeEach(async () => {
      organizer.moveConfig.targetPath = TARGET;
      await tick();
      await drainAsync();
      mockExists.mockResolvedValue(false);
      vi.mocked(rename).mockResolvedValue(undefined);
      mockReadDir.mockResolvedValue([file("a.txt"), file("b.txt")]);
      await triggerScan();
    });

    it("sets state to moving during execution, then done", async () => {
      let stateWhileMoving: string | null = null;
      vi.mocked(rename).mockImplementation(async () => {
        stateWhileMoving = organizer.state;
      });
      mockExists.mockResolvedValueOnce(true).mockResolvedValue(false); // oldFullPath exists, newFullPath does not
      await organizer.moveAll();
      expect(stateWhileMoving).toBe("moving");
      expect(organizer.state).toBe("done");
    });

    it("renames each entry to targetPath/basename", async () => {
      mockExists.mockImplementation(async (p) => String(p).startsWith("/test/"));
      await organizer.moveAll();
      expect(vi.mocked(rename)).toHaveBeenCalledWith("/test/a.txt", `${TARGET}/a.txt`);
      expect(vi.mocked(rename)).toHaveBeenCalledWith("/test/b.txt", `${TARGET}/b.txt`);
      expect(organizer.entries.every((e) => e.status?.ok === true)).toBe(true);
    });

    it("skips ignored entries", async () => {
      mockExists.mockImplementation(async (p) => String(p).startsWith("/test/"));
      organizer.entries[0].ignored = true;
      await organizer.moveAll();
      expect(organizer.entries[0].status).toBeUndefined();
      expect(organizer.entries[1].status?.ok).toBe(true);
    });

    it("marks entry Not found when source does not exist", async () => {
      mockExists.mockResolvedValue(false);
      await organizer.moveAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "Not found" });
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
    });

    it("marks entry Already exists when target is occupied at move time", async () => {
      mockExists.mockResolvedValue(true); // both oldFullPath and newFullPath exist
      await organizer.moveAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "Already exists" });
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
    });

    it("marks both entries when two entries share the same basename", async () => {
      mockReadDir.mockResolvedValue([file("a.txt"), folder("sub")]);
      await triggerScan();
      // inject a second entry whose basename would collide
      organizer.entries[1] = { path: "other/a.txt", isFile: true, ignored: false };
      await organizer.moveAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "Name conflict with another entry" });
      expect(organizer.entries[1].status).toEqual({ ok: false, message: "Name conflict with another entry" });
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
    });

    it("marks entry with error message when rename throws", async () => {
      mockExists.mockImplementation(async (p) => String(p).startsWith("/test/"));
      vi.mocked(rename).mockRejectedValue(new Error("permission denied"));
      await organizer.moveAll();
      expect(organizer.entries[0].status).toEqual({ ok: false, message: "permission denied" });
    });

    it("does not start a second execution when already executing", async () => {
      let resolveExists!: (v: boolean) => void;
      mockExists.mockReturnValueOnce(
        new Promise((res) => {
          resolveExists = res;
        }),
      );
      const first = organizer.moveAll();
      await Promise.resolve();
      await Promise.resolve();
      expect(organizer.state).toBe("moving");
      await organizer.moveAll();
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
      resolveExists(false);
      await first;
      expect(organizer.state).toBe("done");
    });

    it("skips folder entries", async () => {
      mockReadDir.mockResolvedValue([file("a.txt"), folder("sub")]);
      organizer.reload();
      await drainAsync(0);
      mockExists.mockImplementation(async (p) => String(p).startsWith("/test/"));
      await organizer.moveAll();
      expect(vi.mocked(rename)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(rename)).toHaveBeenCalledWith("/test/a.txt", `${TARGET}/a.txt`);
      expect(organizer.entries.find((e) => e.path === "sub")?.status).toBeUndefined();
    });

    it("does nothing when moveTargetIsValid is false", async () => {
      mockStat.mockResolvedValue(REGULAR_FILE);
      organizer.moveConfig.targetPath = "/some/file.txt";
      await tick();
      await drainAsync();
      await organizer.moveAll();
      expect(organizer.state).toBe("idle");
      expect(vi.mocked(rename)).not.toHaveBeenCalled();
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
