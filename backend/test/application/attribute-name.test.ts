import { describe, expect, it } from "vitest";

import {
  getAgeGroupName,
  getGenderName,
} from "../../src/application/entity/attribute-name";
import { getRegionName } from "../../src/application/entity/region-name";

describe("attribute name master", () => {
  it("converts gender codes for each display language", () => {
    expect(getGenderName("male", "original")).toBe("男性");
    expect(getGenderName("male", "jaHira")).toBe("だんせい");
    expect(getGenderName("male", "en")).toBe("Male");
    expect(getGenderName(null, "en")).toBeUndefined();
    expect(getGenderName("unknown", "en")).toBe("unknown");
  });

  it("converts age group codes for each display language", () => {
    expect(getAgeGroupName("90s_plus", "original")).toBe("90代以上");
    expect(getAgeGroupName("90s_plus", "jaHira")).toBe("90だいいじょう");
    expect(getAgeGroupName("90s_plus", "en")).toBe("90 and over");
    expect(getAgeGroupName(undefined, "en")).toBeUndefined();
  });

  it("converts no_answer region codes with the shared master", () => {
    expect(getRegionName("no_answer", "en")).toBe("Prefer not to say");
    expect(getRegionName("tokyo", "en")).toBe("Tokyo");
  });
});
