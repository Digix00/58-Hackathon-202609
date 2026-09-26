import { describe, expect, it } from "vitest";

import { ReactionDigestSummary } from "../../../src/application/entity/reaction-digest.entity";
import { buildReactionDigestMessage } from "../../../src/application/shared/reaction-digest-message";

const url = "https://liff.line.me/1234567890-AbcdEfgh/";

describe("buildReactionDigestMessage", () => {
  it("writes the hiragana template", () => {
    const summary = new ReactionDigestSummary({
      reactorCount: 4,
      sameRegionCount: 2,
      regionCount: 3,
      regionCode: "kyoto",
    });

    expect(buildReactionDigestMessage(summary, "jaHira", url)).toBe(
      [
        "あなたの なやみに、4にんが そっと よりそいました。",
        "そのうち 2にんは、あなたと おなじ きょうとふの ひとです。",
        "ぜんこく 3つの とどうふけんから とどいています。",
        "",
        "▼ みんなの なやみを みてみる",
        url,
      ].join("\n"),
    );
  });

  it("omits region lines without a shared prefecture or multiple prefectures", () => {
    const summary = new ReactionDigestSummary({
      reactorCount: 1,
      sameRegionCount: 1,
      regionCount: 1,
      regionCode: "no_answer",
    });

    expect(buildReactionDigestMessage(summary, "original", url)).toBe(
      [
        "あなたの悩みに、1人がそっと寄りそいました。",
        "",
        "▼ みんなの悩みを見てみる",
        url,
      ].join("\n"),
    );
  });

  it("rejects inconsistent counts", () => {
    expect(
      () =>
        new ReactionDigestSummary({
          reactorCount: 1,
          sameRegionCount: 2,
          regionCount: 0,
          regionCode: null,
        }),
    ).toThrow(RangeError);
  });
});
