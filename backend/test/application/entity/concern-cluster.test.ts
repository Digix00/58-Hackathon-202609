import { describe, expect, it } from "vitest";

import {
  CONCERN_CLUSTER_LABEL_MAX_LENGTH,
  CONCERN_CLUSTER_SUMMARY_INPUT_LIMIT,
  CONCERN_CLUSTER_SUMMARY_MAX_LENGTH,
  ConcernClusterSummary,
  ConcernClusterSummaryInput,
  ConcernClusterValidationError,
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
    ["メールアドレス", "学校での悩み", "相談先は user@example.com です。"],
    ["電話番号（国内）", "学校での悩み", "連絡先は 090-1234-5678 です。"],
    ["電話番号（国際）", "学校での悩み", "連絡先は +81 90-1234-5678 です。"],
    ["郵便番号", "学校での悩み", "住所は〒160-0023です。"],
    ["住所", "学校での悩み", "東京都新宿区西新宿2-8-1に住んでいます。"],
    ["URL", "学校での悩み", "詳細は https://example.com を見てください。"],
    ["人名", "学校での悩み", "田中さんとの人間関係に関する悩みです。"],
    [
      "敬称なしの人名",
      "学校での悩み",
      "田中太郎との人間関係に関する悩みです。",
    ],
  ])("rejects generated text containing %s", (_name, label, summary) => {
    expect(() => new ConcernClusterSummary({ label, summary })).toThrow();
  });
});

it("does not filter generated text with a fixed list of terms", () => {
  expect(
    () =>
      new ConcernClusterSummary({
        label: "会話で使う表現",
        summary: "「馬鹿にする」という言葉の意味を確認しました。",
      }),
  ).not.toThrow();
});

it("allows years and prices that are not phone numbers", () => {
  expect(
    () =>
      new ConcernClusterSummary({
        label: "生活費の悩み",
        summary: "2026年の物価上昇で、昼食代の1000円を負担に感じています。",
      }),
  ).not.toThrow();
});

it.each(["仕事ばかりで休めない", "不安ばかりが増える"])(
  "allows normal Japanese text containing ばかり: %s",
  (summary) => {
    expect(
      () => new ConcernClusterSummary({ label: "生活の悩み", summary }),
    ).not.toThrow();
  },
);

it.each([
  "東京都新宿区では20-30代の生活費が課題です。",
  "大阪府大阪市で9-17時勤務が負担です。",
  "東京都新宿区の20-30代では、家賃が負担です。",
])("allows a region followed by a non-address number range: %s", (summary) => {
  expect(
    () => new ConcernClusterSummary({ label: "地域の悩み", summary }),
  ).not.toThrow();
});

it.each([
  "患者さんへの説明に困っています。",
  "保護者さんとの連絡が難しいです。",
  "看護師さんに相談しづらいです。",
  "関係者との連携に困っています。",
])("allows generic role references: %s", (summary) => {
  expect(
    () => new ConcernClusterSummary({ label: "相談の悩み", summary }),
  ).not.toThrow();
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
    ).toThrow(ConcernClusterValidationError);
    expect(
      () =>
        new ConcernClusterSummaryInput({
          clusterId: "cluster-1",
          concernBodies: Array.from(
            { length: CONCERN_CLUSTER_SUMMARY_INPUT_LIMIT + 1 },
            () => "本文",
          ),
        }),
    ).toThrow(ConcernClusterValidationError);
    expect(
      () =>
        new ConcernClusterSummaryInput({
          clusterId: "cluster-1",
          concernBodies: ["   "],
        }),
    ).toThrow(ConcernClusterValidationError);
  });
});
