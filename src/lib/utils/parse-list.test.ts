import { describe, expect, it } from "vitest";
import { parseList } from "./parse-list";

describe("parseList", () => {
  it("splits comma-separated values", () => {
    expect(parseList("a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace", () => {
    expect(parseList("  foo  ,  bar  ")).toEqual(["foo", "bar"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseList("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseList("   ")).toEqual([]);
  });

  it("filters out empty segments from trailing/leading commas", () => {
    expect(parseList(",a,b,")).toEqual(["a", "b"]);
  });

  it("filters out whitespace-only segments", () => {
    expect(parseList("a,  , b")).toEqual(["a", "b"]);
  });

  it("handles single value without comma", () => {
    expect(parseList("*.mkv")).toEqual(["*.mkv"]);
  });
});
