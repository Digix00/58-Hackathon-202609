import { describe, expect, it } from "vitest";

import {
  ConcernCluster,
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

  it("keeps long text and contact information from the generated output", () => {
    const label = "x".repeat(101);
    const summary = `${"x".repeat(501)} 田中さん user@example.com 090-1234-5678 https://example.com`;

    expect(new ConcernClusterSummary({ label, summary })).toEqual({
      label,
      summary,
    });
  });

  it("rejects blank labels and summaries", () => {
    expect(
      () => new ConcernClusterSummary({ label: " ", summary: "要約です。" }),
    ).toThrow(ConcernClusterValidationError);
    expect(
      () => new ConcernClusterSummary({ label: "学校の悩み", summary: " " }),
    ).toThrow(ConcernClusterValidationError);
  });
});

describe("ConcernClusterSummaryInput", () => {
  it("trims concern text sent to the model", () => {
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

  it("rejects empty and blank-only inputs", () => {
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
          concernBodies: ["   "],
        }),
    ).toThrow(ConcernClusterValidationError);
  });

  it("accepts any number and total length of nonempty concern bodies", () => {
    const concernBodies = Array.from({ length: 11 }, () => "x".repeat(2_001));

    expect(
      new ConcernClusterSummaryInput({ clusterId: "cluster-1", concernBodies })
        .concernBodies,
    ).toHaveLength(11);
  });
});

it("accepts long labels and summaries on a ready cluster", () => {
  const label = "x".repeat(101);
  const summary = "y".repeat(501);

  expect(
    new ConcernCluster({ id: "cluster-1", label, summary, status: "ready" }),
  ).toMatchObject({ label, summary });
});
