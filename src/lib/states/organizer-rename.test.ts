import { describe, expect, it } from "vitest";
import { applyRename, computeNewName } from "./organizer-rename";
import type { Entry } from "./organizer-types";

function entry(path: string, isFile = true): Entry {
  return { path, isFile, ignored: false };
}

describe("applyRename", () => {
  it("replaces named capture groups in the pattern", () => {
    const regex = /(?<year>\d{4})-(?<month>\d{2})/;
    expect(applyRename("2024-03.txt", true, regex, "$<month>_$<year>")).toBe("03_2024.txt");
  });

  it("returns null when regex does not match", () => {
    const regex = /(?<year>\d{4})/;
    expect(applyRename("no-year.txt", true, regex, "$<year>")).toBeNull();
  });

  it("preserves file extension for files", () => {
    const regex = /(?<stem>[^.]+)/;
    expect(applyRename("report.pdf", true, regex, "renamed_$<stem>")).toBe("renamed_report.pdf");
  });

  it("does not append extension for folders", () => {
    const regex = /(?<name>.+)/;
    expect(applyRename("my-folder", false, regex, "renamed_$<name>")).toBe("renamed_my-folder");
  });

  it("treats dotfiles as having no extension", () => {
    const regex = /(?<name>.+)/;
    expect(applyRename(".gitignore", true, regex, "new_$<name>")).toBe("new_.gitignore");
  });

  it("doubles extension if regex captures it (caller must exclude extension from match)", () => {
    // /(?<name>.+)/ captures ".eslintrc.json" → newStem = "new_.eslintrc.json" → + ".json" appended
    const regex = /(?<name>.+)/;
    expect(applyRename(".eslintrc.json", true, regex, "new_$<name>")).toBe("new_.eslintrc.json.json");
  });

  it("correctly renames dotfile with extension when regex excludes the extension", () => {
    const regex = /(?<stem>.eslintrc)\.[^.]+$/;
    expect(applyRename(".eslintrc.json", true, regex, "new_$<stem>")).toBe("new_.eslintrc.json");
  });

  it("replaces missing optional groups with empty string", () => {
    const regex = /(?<a>\d+)(-(?<b>\d+))?/;
    expect(applyRename("42.txt", true, regex, "$<a>_$<b>")).toBe("42_.txt");
  });

  it("handles multiple occurrences of the same placeholder", () => {
    const regex = /(?<word>\w+)/;
    expect(applyRename("hello.txt", true, regex, "$<word>-$<word>")).toBe("hello-hello.txt");
  });

  it("returns pattern as-is when regex has no named groups and matches", () => {
    const regex = /\d+/;
    expect(applyRename("123.txt", true, regex, "fixed")).toBe("fixed.txt");
  });
});

describe("computeNewName", () => {
  it("returns null when regex is null", () => {
    expect(computeNewName(entry("/some/file.txt"), null, "$<name>")).toBeNull();
  });

  it("extracts filename from path and applies rename", () => {
    const regex = /(?<stem>.+)\..+/;
    expect(computeNewName(entry("/a/b/report.txt"), regex, "new_$<stem>")).toBe("new_report.txt");
  });

  it("works for folders", () => {
    const regex = /(?<name>.+)/;
    expect(computeNewName(entry("/a/b/my-folder", false), regex, "renamed_$<name>")).toBe("renamed_my-folder");
  });

  it("returns null when path yields no filename", () => {
    const regex = /(?<name>.+)/;
    // A trailing slash makes pop() return an empty string
    expect(computeNewName(entry("/a/b/", true), regex, "$<name>")).toBeNull();
  });

  it("returns null when filename does not match regex", () => {
    const regex = /(?<year>\d{4})/;
    expect(computeNewName(entry("/a/b/readme.md"), regex, "$<year>")).toBeNull();
  });
});
