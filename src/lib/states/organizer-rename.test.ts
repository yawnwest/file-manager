import { describe, expect, it } from "vitest";
import { isVideoPath } from "$lib/constants";
import { applyRename, computeNewName } from "./organizer-rename";
import type { Entry } from "./organizer-types";

function entry(path: string, isFile = true): Entry {
  return { path, isFile, ignored: false };
}

describe("isVideoPath", () => {
  it("recognizes common video extensions", () => {
    expect(isVideoPath("clip.mov")).toBe(true);
    expect(isVideoPath("movie.mp4")).toBe(true);
  });

  it("rejects non-video files", () => {
    expect(isVideoPath("notes.txt")).toBe(false);
    expect(isVideoPath("README")).toBe(false);
  });
});

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

  it("does not append extension when the renamed stem already contains it", () => {
    // /(?<name>.+)/ captures ".eslintrc.json" → newStem = "new_.eslintrc.json" → extension should not be duplicated
    const regex = /(?<name>.+)/;
    expect(applyRename(".eslintrc.json", true, regex, "new_$<name>")).toBe("new_.eslintrc.json");
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

  it("replaces $<filename> with the stem of a file", () => {
    const regex = /.*/;
    expect(applyRename("report.pdf", true, regex, "$<filename>-copy")).toBe("report-copy.pdf");
  });

  it("replaces $<filename> with the full name for folders", () => {
    const regex = /.*/;
    expect(applyRename("my-folder", false, regex, "$<filename>-copy")).toBe("my-folder-copy");
  });

  it("replaces $<filename> with full name for dotfiles (no extension)", () => {
    const regex = /.*/;
    expect(applyRename(".gitignore", true, regex, "$<filename>-copy")).toBe(".gitignore-copy");
  });

  it("replaces $<filename> alongside named groups", () => {
    const regex = /(?<n>\d+)/;
    expect(applyRename("report42.txt", true, regex, "$<filename>_$<n>")).toBe("report42_42.txt");
  });

  it("replaces $<length> with [[hh-mm-ss]] in the result", () => {
    const regex = /(?<stem>.+)\.mov/;
    expect(applyRename("clip.mov", true, regex, "$<stem>_$<length>", "01-02-03")).toBe("clip_[[01-02-03]].mov");
  });

  it("does not append extension when the renamed stem already contains it", () => {
    const regex = /(?<name>.*)/;
    expect(applyRename("clip 9.mp4", true, regex, "$<name>")).toBe("clip 9.mp4");
  });

  it("returns null for non-video files when $<length> is used", () => {
    const regex = /(?<stem>.+)\.txt/;
    expect(applyRename("doc.txt", true, regex, "$<stem>_$<length>", "01-02-03")).toBeNull();
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

  it("injects duration for video entries when available", () => {
    const regex = /(?<stem>.+)\.mov/;
    expect(computeNewName(entry("/a/b/clip.mov"), regex, "$<stem>_$<length>", "01-02-03")).toBe(
      "clip_[[01-02-03]].mov",
    );
  });
});
