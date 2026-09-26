import { describe, expect, it } from "vitest";

import { deriveAgeGroup } from "../../src/application/shared/age-group";

const NOW = new Date("2026-09-22T00:00:00.000Z");

describe("deriveAgeGroup", () => {
  it("returns null when birthYear or birthMonth is missing", () => {
    expect(deriveAgeGroup(null, 9, NOW)).toBeNull();
    expect(deriveAgeGroup(2000, null, NOW)).toBeNull();
    expect(deriveAgeGroup(null, null, NOW)).toBeNull();
  });

  it("returns null when the derived age is under the supported minimum", () => {
    // 2026-09時点で9歳（2016年10月生まれ、まだ誕生日前）
    expect(deriveAgeGroup(2016, 10, NOW)).toBeNull();
  });

  it("treats the birth month boundary as already had the birthday", () => {
    // 誕生月と同じ月は誕生日を迎えたとみなす
    expect(deriveAgeGroup(2016, 9, NOW)).toBe("10s");
  });

  it.each([
    { birthYear: 2007, birthMonth: 8, expected: "10s" }, // 19歳（10sの上限）
    { birthYear: 2006, birthMonth: 8, expected: "20s" }, // 20歳（20sの下限）
    { birthYear: 1996, birthMonth: 8, expected: "30s" },
    { birthYear: 1986, birthMonth: 8, expected: "40s" },
    { birthYear: 1976, birthMonth: 8, expected: "50s" },
    { birthYear: 1966, birthMonth: 8, expected: "60s" },
    { birthYear: 1956, birthMonth: 8, expected: "70s" },
    { birthYear: 1946, birthMonth: 8, expected: "80s" },
    { birthYear: 1936, birthMonth: 8, expected: "90s_plus" }, // 90歳（90s_plusの下限）
    { birthYear: 1900, birthMonth: 8, expected: "90s_plus" },
  ])(
    "maps birthYear=$birthYear birthMonth=$birthMonth to $expected",
    ({ birthYear, birthMonth, expected }) => {
      expect(deriveAgeGroup(birthYear, birthMonth, NOW)).toBe(expected);
    },
  );
});
