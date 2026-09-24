import { describe, expect, it } from "vitest";

import {
  CONCERN_CLUSTER_LABEL_MAX_LENGTH,
  CONCERN_CLUSTER_SUMMARY_INPUT_LIMIT,
  CONCERN_CLUSTER_SUMMARY_MAX_LENGTH,
  ConcernClusterSummary,
  ConcernClusterSummaryInput,
} from "../../../src/application/entity/concern-cluster";

describe("ConcernClusterSummary", () => {
  it("trims valid display text", () => {
    expect(
      new ConcernClusterSummary({
        label: "  学校での人間関係  ",
        summary: "  友人との距離感や、周囲に相談しづらい悩みです。  ",
      }),
    ).toEqual({
      label: "学校での人間関係",
      summary: "友人との距離感や、周囲に相談しづらい悩みです。",
    });
  });

  it("enforces the label and summary length limits", () => {
    expect(
      () =>
        new ConcernClusterSummary({
          label: "x".repeat(CONCERN_CLUSTER_LABEL_MAX_LENGTH + 1),
          summary: "有効な要約です。",
        }),
    ).toThrow("label must contain");
    expect(
      () =>
        new ConcernClusterSummary({
          label: "学校での悩み",
          summary: "x".repeat(CONCERN_CLUSTER_SUMMARY_MAX_LENGTH + 1),
        }),
    ).toThrow("summary must contain");
    expect(
      () =>
        new ConcernClusterSummary({ label: " ", summary: "有効な要約です。" }),
    ).toThrow("label must contain");
  });

  it.each([
    ["禁止語", "学校での悩み", "周りの人を馬鹿にする内容です。"],
    ["メールアドレス", "学校での悩み", "相談先は user@example.com です。"],
    ["電話番号", "学校での悩み", "連絡先は 090-1234-5678 です。"],
    ["URL", "学校での悩み", "詳細は https://example.com を見てください。"],
    ["人名", "学校での悩み", "田中さんとの人間関係に関する悩みです。"],
  ])("rejects generated text containing %s", (_name, label, summary) => {
    expect(() => new ConcernClusterSummary({ label, summary })).toThrow();
  });
});

describe("ConcernClusterSummaryInput", () => {
  it("trims and bounds concern text sent to the model", () => {
    const input = new ConcernClusterSummaryInput({
      clusterId: " cluster-1 ",
      concernBodies: [" 学校で友人と話しづらい ", " 相談できる人がいない "],
    });

    expect(input.clusterId).toBe("cluster-1");
    expect(input.concernBodies).toEqual([
      "学校で友人と話しづらい",
      "相談できる人がいない",
    ]);
  });

  it("rejects empty, oversized, and blank-only inputs", () => {
    expect(
      () =>
        new ConcernClusterSummaryInput({
          clusterId: "cluster-1",
          concernBodies: [],
        }),
    ).toThrow(TypeError);
    expect(
      () =>
        new ConcernClusterSummaryInput({
          clusterId: "cluster-1",
          concernBodies: Array.from(
            { length: CONCERN_CLUSTER_SUMMARY_INPUT_LIMIT + 1 },
            () => "本文",
          ),
        }),
    ).toThrow(TypeError);
    expect(
      () =>
        new ConcernClusterSummaryInput({
          clusterId: "cluster-1",
          concernBodies: ["   "],
        }),
    ).toThrow(TypeError);
  });
});
