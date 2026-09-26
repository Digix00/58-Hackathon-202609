import { describe, expect, it } from "vitest";

import { resolveDisplayLanguage } from "../../src/util/display-language";

describe("display language resolution", () => {
  it("prefers the requested language", () => {
    expect(resolveDisplayLanguage("en", "jaHira")).toBe("en");
  });

  it("falls back to the user's display language, then original", () => {
    expect(resolveDisplayLanguage(undefined, "jaHira")).toBe("jaHira");
    expect(resolveDisplayLanguage(undefined, undefined)).toBe("original");
  });
});
