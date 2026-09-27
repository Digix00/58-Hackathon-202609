/**
 * アプリケーションで扱う47都道府県コードを定義する。
 * この定義をバックエンド側の正とし、frontend/src/features/post/postTypes.ts と値を同期させること。
 * regionsテーブルや外部マスタは参照しない。
 */
export const REGION_CODES = [
  "hokkaido",
  "aomori",
  "iwate",
  "miyagi",
  "akita",
  "yamagata",
  "fukushima",
  "ibaraki",
  "tochigi",
  "gunma",
  "saitama",
  "chiba",
  "tokyo",
  "kanagawa",
  "niigata",
  "toyama",
  "ishikawa",
  "fukui",
  "yamanashi",
  "nagano",
  "gifu",
  "shizuoka",
  "aichi",
  "mie",
  "shiga",
  "kyoto",
  "osaka",
  "hyogo",
  "nara",
  "wakayama",
  "tottori",
  "shimane",
  "okayama",
  "hiroshima",
  "yamaguchi",
  "tokushima",
  "kagawa",
  "ehime",
  "kochi",
  "fukuoka",
  "saga",
  "nagasaki",
  "kumamoto",
  "oita",
  "miyazaki",
  "kagoshima",
  "okinawa",
] as const;

export type RegionCode = (typeof REGION_CODES)[number];

/** 近さの判定に使う8地方区分。都道府県より広い粒度で「近くの悩み」を選ぶために使う。 */
export const REGION_AREAS = [
  "hokkaido",
  "tohoku",
  "kanto",
  "chubu",
  "kinki",
  "chugoku",
  "shikoku",
  "kyushu",
] as const;

export type RegionArea = (typeof REGION_AREAS)[number];

const REGION_AREA_BY_CODE: Record<RegionCode, RegionArea> = {
  hokkaido: "hokkaido",
  aomori: "tohoku",
  iwate: "tohoku",
  miyagi: "tohoku",
  akita: "tohoku",
  yamagata: "tohoku",
  fukushima: "tohoku",
  ibaraki: "kanto",
  tochigi: "kanto",
  gunma: "kanto",
  saitama: "kanto",
  chiba: "kanto",
  tokyo: "kanto",
  kanagawa: "kanto",
  niigata: "chubu",
  toyama: "chubu",
  ishikawa: "chubu",
  fukui: "chubu",
  yamanashi: "chubu",
  nagano: "chubu",
  gifu: "chubu",
  shizuoka: "chubu",
  aichi: "chubu",
  mie: "kinki",
  shiga: "kinki",
  kyoto: "kinki",
  osaka: "kinki",
  hyogo: "kinki",
  nara: "kinki",
  wakayama: "kinki",
  tottori: "chugoku",
  shimane: "chugoku",
  okayama: "chugoku",
  hiroshima: "chugoku",
  yamaguchi: "chugoku",
  tokushima: "shikoku",
  kagawa: "shikoku",
  ehime: "shikoku",
  kochi: "shikoku",
  fukuoka: "kyushu",
  saga: "kyushu",
  nagasaki: "kyushu",
  kumamoto: "kyushu",
  oita: "kyushu",
  miyazaki: "kyushu",
  kagoshima: "kyushu",
  okinawa: "kyushu",
};

/** 都道府県コードから地方区分を返す。未知のコードやnullはnullとする。 */
export function getRegionArea(
  regionCode: string | null | undefined,
): RegionArea | null {
  if (!regionCode) {
    return null;
  }
  return REGION_AREA_BY_CODE[regionCode as RegionCode] ?? null;
}
