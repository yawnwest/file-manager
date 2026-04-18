import { describe, expect, it } from "vitest";
import { globToRegex, matchesFilters } from "./organizer-filters";
import type { FilterConfig } from "./organizer-types";

function compiled(includes: string[], excludes: string[]) {
  return {
    include: includes.map(globToRegex).filter((r) => r !== null) as RegExp[],
    exclude: excludes.map(globToRegex).filter((r) => r !== null) as RegExp[],
  };
}

function filters(overrides: Partial<FilterConfig> = {}): FilterConfig {
  return {
    includePatterns: [],
    excludePatterns: [],
    excludeFiles: false,
    excludeFolders: false,
    excludeSystemFiles: false,
    recursive: false,
    isEmpty: false,
    ...overrides,
  };
}

function matches(pattern: string, path: string): boolean {
  const r = globToRegex(pattern);
  return r !== null && r.test(path);
}

describe("globToRegex", () => {
  describe("no slash → filename match anywhere", () => {
    it("matches exact name at root", () => expect(matches(".husky", ".husky")).toBe(true));
    it("matches exact name in subdir", () => expect(matches(".husky", "a/.husky")).toBe(true));
    it("matches exact name deeply nested", () => expect(matches(".husky", "a/b/c/.husky")).toBe(true));
    it("does not match partial name", () => expect(matches(".husky", "not-.husky")).toBe(false));
    it("does not match child paths", () => expect(matches(".husky", ".husky/child")).toBe(false));

    it("wildcard *.tmp matches at root", () => expect(matches("*.tmp", "file.tmp")).toBe(true));
    it("wildcard *.tmp matches in subdir", () => expect(matches("*.tmp", "src/file.tmp")).toBe(true));
    it("wildcard *.tmp matches in deeply nested subdir", () => expect(matches("*.tmp", "src/sub/file.tmp")).toBe(true));
    it("wildcard *.tmp does not match wrong ext", () => expect(matches("*.tmp", "file.txt")).toBe(false));

    it("node_modules matches anywhere", () => expect(matches("node_modules", "a/b/node_modules")).toBe(true));
  });

  describe("leading slash → anchored to root", () => {
    it("matches at root", () => expect(matches("/src", "src")).toBe(true));
    it("does not match in subdir", () => expect(matches("/src", "a/src")).toBe(false));
    it("matches root with wildcard", () => expect(matches("/src/*.ts", "src/foo.ts")).toBe(true));
    it("does not match nested with anchored wildcard", () =>
      expect(matches("/src/*.ts", "src/sub/foo.ts")).toBe(false));
  });

  describe("slash in middle → full path match", () => {
    it("exact path", () => expect(matches("src/foo.ts", "src/foo.ts")).toBe(true));
    it("no match on different path", () => expect(matches("src/foo.ts", "lib/foo.ts")).toBe(false));
    it("no match on root-only", () => expect(matches("src/foo.ts", "foo.ts")).toBe(false));
  });

  describe("**/ prefix → match anywhere", () => {
    it("**/.husky matches at root", () => expect(matches("**/.husky", ".husky")).toBe(true));
    it("**/.husky matches in subdir", () => expect(matches("**/.husky", "a/.husky")).toBe(true));
    it("**/.husky matches deeply nested", () => expect(matches("**/.husky", "a/b/.husky")).toBe(true));
    it("**/.husky does not match child", () => expect(matches("**/.husky", ".husky/child")).toBe(false));
    it("**/node_modules matches at root", () => expect(matches("**/node_modules", "node_modules")).toBe(true));
    it("**/node_modules matches nested", () => expect(matches("**/node_modules", "a/b/node_modules")).toBe(true));
  });

  describe("/** suffix → match directory and contents", () => {
    it("src/** matches direct child", () => expect(matches("src/**", "src/foo.ts")).toBe(true));
    it("src/** matches nested child", () => expect(matches("src/**", "src/a/b/foo.ts")).toBe(true));
    it("src/** matches the dir itself", () => expect(matches("src/**", "src")).toBe(true));
    it("src/** does not match sibling", () => expect(matches("src/**", "lib/foo.ts")).toBe(false));
  });

  describe("combined ** patterns", () => {
    it("**/.husky/** matches dir itself", () => expect(matches("**/.husky/**", ".husky")).toBe(true));
    it("**/.husky/** matches dir in subdir", () => expect(matches("**/.husky/**", "a/.husky")).toBe(true));
    it("**/.husky/** matches child", () => expect(matches("**/.husky/**", ".husky/child")).toBe(true));
    it("**/.husky/** matches nested child", () => expect(matches("**/.husky/**", "a/.husky/b/c")).toBe(true));
    it("**/*.ts matches ts files anywhere", () => expect(matches("**/*.ts", "src/foo.ts")).toBe(true));
    it("**/*.ts matches at root", () => expect(matches("**/*.ts", "foo.ts")).toBe(true));
  });

  describe("trailing slash stripped", () => {
    it(".husky/ same as .husky", () => expect(matches(".husky/", ".husky")).toBe(true));
    it("src/ same as src", () => expect(matches("src/", "a/src")).toBe(true));
  });

  describe("case sensitive", () => {
    it("does not match different case", () => expect(matches(".HUSKY", "a/.husky")).toBe(false));
    it("matches same case", () => expect(matches(".husky", "a/.husky")).toBe(true));
    it("wildcard *.TS does not match foo.ts", () => expect(matches("*.TS", "foo.ts")).toBe(false));
    it("wildcard *.ts matches foo.ts", () => expect(matches("*.ts", "foo.ts")).toBe(true));
    it("NODE_MODULES does not match node_modules", () => expect(matches("NODE_MODULES", "node_modules")).toBe(false));
  });
});

describe("matchesFilters", () => {
  describe("no patterns → everything passes", () => {
    it("file passes", () => expect(matchesFilters("foo.ts", true, filters(), compiled([], []))).toBe(true));
    it("folder passes", () => expect(matchesFilters("src", false, filters(), compiled([], []))).toBe(true));
  });

  describe("include only", () => {
    it("matching file passes", () =>
      expect(matchesFilters("foo.ts", true, filters(), compiled(["*.ts"], []))).toBe(true));
    it("non-matching file fails", () =>
      expect(matchesFilters("foo.js", true, filters(), compiled(["*.ts"], []))).toBe(false));
    it("filename match works in subdir", () =>
      expect(matchesFilters("src/foo.ts", true, filters(), compiled(["*.ts"], []))).toBe(true));
    it("path pattern include", () =>
      expect(matchesFilters("src/foo.ts", true, filters(), compiled(["src/**"], []))).toBe(true));
    it("path pattern excludes other dir", () =>
      expect(matchesFilters("lib/foo.ts", true, filters(), compiled(["src/**"], []))).toBe(false));
  });

  describe("exclude only", () => {
    it("matching file fails", () =>
      expect(matchesFilters("foo.tmp", true, filters(), compiled([], ["*.tmp"]))).toBe(false));
    it("non-matching file passes", () =>
      expect(matchesFilters("foo.ts", true, filters(), compiled([], ["*.tmp"]))).toBe(true));
    it("matching folder fails", () =>
      expect(matchesFilters("node_modules", false, filters(), compiled([], ["node_modules"]))).toBe(false));
    it("nested match fails", () =>
      expect(matchesFilters("a/b/.husky", false, filters(), compiled([], [".husky"]))).toBe(false));
  });

  describe("include and exclude together", () => {
    it("matches include, not exclude → passes", () =>
      expect(matchesFilters("foo.ts", true, filters(), compiled(["*.ts"], ["*.test.ts"]))).toBe(true));
    it("matches both → exclude wins", () =>
      expect(matchesFilters("foo.test.ts", true, filters(), compiled(["*.ts"], ["*.test.ts"]))).toBe(false));
    it("matches neither → fails on include", () =>
      expect(matchesFilters("foo.js", true, filters(), compiled(["*.ts"], ["*.test.ts"]))).toBe(false));
    it("path include + path exclude passes non-excluded subdir", () =>
      expect(matchesFilters("src/foo.ts", true, filters(), compiled(["src/**"], ["src/generated/**"]))).toBe(true));
    it("path include + path exclude, excluded subdir fails", () =>
      expect(matchesFilters("src/generated/foo.ts", true, filters(), compiled(["src/**"], ["src/generated/**"]))).toBe(
        false,
      ));
  });

  describe("excludeFiles flag", () => {
    it("file fails", () =>
      expect(matchesFilters("foo.ts", true, filters({ excludeFiles: true }), compiled([], []))).toBe(false));
    it("folder passes", () =>
      expect(matchesFilters("src", false, filters({ excludeFiles: true }), compiled([], []))).toBe(true));
    it("file fails even if it matches include", () =>
      expect(matchesFilters("foo.ts", true, filters({ excludeFiles: true }), compiled(["*.ts"], []))).toBe(false));
  });

  describe("excludeFolders flag", () => {
    it("folder fails", () =>
      expect(matchesFilters("src", false, filters({ excludeFolders: true }), compiled([], []))).toBe(false));
    it("file passes", () =>
      expect(matchesFilters("foo.ts", true, filters({ excludeFolders: true }), compiled([], []))).toBe(true));
  });

  describe("case sensitive patterns", () => {
    it("include with wrong case does not match", () =>
      expect(matchesFilters("foo.ts", true, filters(), compiled(["*.TS"], []))).toBe(false));
    it("exclude with wrong case does not block", () =>
      expect(matchesFilters("foo.tmp", true, filters(), compiled([], ["*.TMP"]))).toBe(true));
  });

  describe("excludeSystemFiles flag", () => {
    it(".DS_Store fails", () =>
      expect(matchesFilters(".DS_Store", true, filters({ excludeSystemFiles: true }), compiled([], []))).toBe(false));
    it(".DS_Store in subdir fails", () =>
      expect(matchesFilters("a/.DS_Store", true, filters({ excludeSystemFiles: true }), compiled([], []))).toBe(false));
    it("regular file passes", () =>
      expect(matchesFilters("foo.ts", true, filters({ excludeSystemFiles: true }), compiled([], []))).toBe(true));
    it("system file fails even if include matches", () =>
      expect(
        matchesFilters(".DS_Store", true, filters({ excludeSystemFiles: true }), compiled(["*.DS_Store"], [])),
      ).toBe(false));
  });
});
