import { describe, expect, it } from "vitest";

import { AGE_GROUPS, GENDERS } from "../../src/application/entity/concern";
import { REGION_CODES } from "../../src/application/entity/region-code";
import {
  getAgeGroupName,
  getGenderName,
  getRegionName,
} from "../../src/util/attribute-name";
import { DISPLAY_LANGUAGES } from "../../src/util/display-language";

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

  it("converts region codes including no_answer", () => {
    expect(getRegionName("tokyo", "original")).toBe("東京都");
    expect(getRegionName("tokyo", "jaHira")).toBe("とうきょうと");
    expect(getRegionName("tokyo", "en")).toBe("Tokyo");
    expect(getRegionName("no_answer", "en")).toBe("Prefer not to say");
  });

  it("does not treat inherited object keys as master codes", () => {
    expect(getRegionName("toString", "en")).toBe("toString");
  });

  it("has a name for every code defined by the application", () => {
    for (const language of DISPLAY_LANGUAGES) {
      for (const gender of GENDERS) {
        expect(getGenderName(gender, language)).not.toBe(gender);
      }
      for (const ageGroup of AGE_GROUPS) {
        if (language === "en" && /^[2-8]0s$/.test(ageGroup)) continue;
        expect(getAgeGroupName(ageGroup, language)).not.toBe(ageGroup);
      }
      for (const regionCode of REGION_CODES) {
        expect(getRegionName(regionCode, language)).not.toBe(regionCode);
      }
    }
  });
});
