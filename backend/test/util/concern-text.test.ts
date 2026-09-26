import { describe, expect, it } from "vitest";

import type { ConcernTextRepresentation } from "../../src/application/entity/concern";
import {
  getConcernRepresentationState,
  selectConcernText,
} from "../../src/util/concern-text";

const representations: ConcernTextRepresentation[] = [
  { locale: "ja-Hira", body: "ひらがな", status: "ready" },
  { locale: "en", body: "failed translation", status: "failed" },
];

describe("concern representation selection", () => {
  it("returns the original text when original is requested", () => {
    expect(selectConcernText("原文", representations, "original")).toEqual({
      body: "原文",
      language: "original",
    });
  });

  it("returns ready hiragana and English representations", () => {
    expect(selectConcernText("原文", representations, "jaHira")).toEqual({
      body: "ひらがな",
      language: "jaHira",
    });
    expect(
      selectConcernText(
        "原文",
        [
          representations[0],
          { locale: "en", body: "English", status: "ready" },
        ],
        "en",
      ),
    ).toEqual({ body: "English", language: "en" });
  });

  it("falls back when the requested representation is failed or missing", () => {
    expect(selectConcernText("原文", representations, "en")).toEqual({
      body: "原文",
      language: "original",
    });
    expect(selectConcernText("原文", [], "jaHira")).toEqual({
      body: "原文",
      language: "original",
    });
  });

  it("reports saved locale states and derives a missing state from processing", () => {
    expect(
      getConcernRepresentationState(representations, "ready", "ja-Hira"),
    ).toBe("ready");
    expect(getConcernRepresentationState(representations, "ready", "en")).toBe(
      "failed",
    );
    expect(getConcernRepresentationState([], "pending", "en")).toBe("pending");
    expect(getConcernRepresentationState([], "failed", "en")).toBe("failed");
  });
});
