/**
 * regionsマスタテーブルを持たないため、暫定的な固定リストでコード値を検証する。
 * frontend/src/features/post/postTypes.ts と値を同期させること。
 * 将来regionsテーブルが必要になった場合は、このファイルをDB参照へ差し替える。
 */
export const REGION_CODES = [
  "hokkaido",
  "tohoku",
  "kanto",
  "chubu",
  "kansai",
  "chugoku",
  "shikoku",
  "kyushu_okinawa",
  "osaka",
  "tokyo",
] as const;

export type RegionCode = (typeof REGION_CODES)[number];
