import { describe, expect, it } from "vitest";
import { matchPatternSnippets } from "./action-panel-snippets";

describe("match pattern snippets", () => {
  it("includes an episode pattern snippet for S01E01", () => {
    const snippet = matchPatternSnippets.find((item: (typeof matchPatternSnippets)[number]) => item.label === "S01E01");

    expect(snippet).toBeDefined();
    expect(snippet?.value).toBe("(?<episode>S\\d\\dE\\d\\d)");
  });
});
