import { getRegionName } from "../../util/attribute-name";
import type { DisplayLanguage } from "../../util/display-language";
import type { ReactionDigestSummary } from "../entity/reaction-digest.entity";

/**
 * 寄りそい通知の本文を表示言語ごとに組み立てる。
 * 本文は保存せず、delivery の集計値から毎回同じ内容を再生成する。
 */
export function buildReactionDigestMessage(
  summary: ReactionDigestSummary,
  displayLanguage: DisplayLanguage,
  linkUrl: string,
): string {
  const regionName = summary.hasSameRegion
    ? getRegionName(summary.regionCode, displayLanguage)
    : undefined;
  const template = TEMPLATES[displayLanguage];
  const lines = [template.reactors(summary.reactorCount)];
  if (regionName) {
    lines.push(template.sameRegion(summary.sameRegionCount, regionName));
  }
  if (summary.hasMultipleRegions) {
    lines.push(template.regions(summary.regionCount));
  }
  lines.push("", template.link, linkUrl);
  return lines.join("\n");
}

interface MessageTemplate {
  reactors(count: number): string;
  sameRegion(count: number, regionName: string): string;
  regions(count: number): string;
  link: string;
}

const TEMPLATES: Readonly<Record<DisplayLanguage, MessageTemplate>> = {
  original: {
    reactors: (count) => `あなたの悩みに、${count}人がそっと寄りそいました。`,
    sameRegion: (count, regionName) =>
      `そのうち${count}人は、あなたと同じ${regionName}の人です。`,
    regions: (count) => `全国${count}つの都道府県から届いています。`,
    link: "▼ みんなの悩みを見てみる",
  },
  jaHira: {
    reactors: (count) =>
      `あなたの なやみに、${count}にんが そっと よりそいました。`,
    sameRegion: (count, regionName) =>
      `そのうち ${count}にんは、あなたと おなじ ${regionName}の ひとです。`,
    regions: (count) =>
      `ぜんこく ${count}つの とどうふけんから とどいています。`,
    link: "▼ みんなの なやみを みてみる",
  },
  en: {
    reactors: (count) =>
      count === 1
        ? "1 person gently stood by your concern."
        : `${count} people gently stood by your concern.`,
    sameRegion: (count, regionName) =>
      count === 1
        ? `1 of them is from ${regionName}, just like you.`
        : `${count} of them are from ${regionName}, just like you.`,
    regions: (count) => `They came from ${count} prefectures across Japan.`,
    link: "▼ See everyone's concerns",
  },
};
