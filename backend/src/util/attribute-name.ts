import type { DisplayLanguage } from "./display-language";

/**
 * 性別・年代・都道府県のコードを表示言語ごとの名称へ変換するマスタデータ。
 * util はアプリケーションの Entity に依存しないため、コードは文字列で扱う。
 */
type AttributeNames = Readonly<Record<DisplayLanguage, string>>;

/** 年代・性別・都道府県で共通して使う「回答しない」の表示名。 */
export const NO_ANSWER_NAMES: AttributeNames = {
  original: "回答しない",
  jaHira: "こたえない",
  en: "Prefer not to say",
};

const GENDER_NAMES: Readonly<Record<string, AttributeNames>> = {
  male: { original: "男性", jaHira: "だんせい", en: "Male" },
  female: { original: "女性", jaHira: "じょせい", en: "Female" },
  non_binary: {
    original: "ノンバイナリー",
    jaHira: "のんばいなりー",
    en: "Non-binary",
  },
  other: { original: "その他", jaHira: "そのた", en: "Other" },
  no_answer: NO_ANSWER_NAMES,
};

const AGE_GROUP_NAMES: Readonly<Record<string, AttributeNames>> = {
  "10s": { original: "10代", jaHira: "10だい", en: "Teens" },
  "20s": { original: "20代", jaHira: "20だい", en: "20s" },
  "30s": { original: "30代", jaHira: "30だい", en: "30s" },
  "40s": { original: "40代", jaHira: "40だい", en: "40s" },
  "50s": { original: "50代", jaHira: "50だい", en: "50s" },
  "60s": { original: "60代", jaHira: "60だい", en: "60s" },
  "70s": { original: "70代", jaHira: "70だい", en: "70s" },
  "80s": { original: "80代", jaHira: "80だい", en: "80s" },
  "90s_plus": {
    original: "90代以上",
    jaHira: "90だいいじょう",
    en: "90 and over",
  },
  no_answer: NO_ANSWER_NAMES,
};

const REGION_NAMES: Readonly<Record<string, AttributeNames>> = {
  no_answer: NO_ANSWER_NAMES,
  hokkaido: { original: "北海道", jaHira: "ほっかいどう", en: "Hokkaido" },
  aomori: { original: "青森県", jaHira: "あおもりけん", en: "Aomori" },
  iwate: { original: "岩手県", jaHira: "いわてけん", en: "Iwate" },
  miyagi: { original: "宮城県", jaHira: "みやぎけん", en: "Miyagi" },
  akita: { original: "秋田県", jaHira: "あきたけん", en: "Akita" },
  yamagata: { original: "山形県", jaHira: "やまがたけん", en: "Yamagata" },
  fukushima: { original: "福島県", jaHira: "ふくしまけん", en: "Fukushima" },
  ibaraki: { original: "茨城県", jaHira: "いばらきけん", en: "Ibaraki" },
  tochigi: { original: "栃木県", jaHira: "とちぎけん", en: "Tochigi" },
  gunma: { original: "群馬県", jaHira: "ぐんまけん", en: "Gunma" },
  saitama: { original: "埼玉県", jaHira: "さいたまけん", en: "Saitama" },
  chiba: { original: "千葉県", jaHira: "ちばけん", en: "Chiba" },
  tokyo: { original: "東京都", jaHira: "とうきょうと", en: "Tokyo" },
  kanagawa: { original: "神奈川県", jaHira: "かながわけん", en: "Kanagawa" },
  niigata: { original: "新潟県", jaHira: "にいがたけん", en: "Niigata" },
  toyama: { original: "富山県", jaHira: "とやまけん", en: "Toyama" },
  ishikawa: { original: "石川県", jaHira: "いしかわけん", en: "Ishikawa" },
  fukui: { original: "福井県", jaHira: "ふくいけん", en: "Fukui" },
  yamanashi: { original: "山梨県", jaHira: "やまなしけん", en: "Yamanashi" },
  nagano: { original: "長野県", jaHira: "ながのけん", en: "Nagano" },
  gifu: { original: "岐阜県", jaHira: "ぎふけん", en: "Gifu" },
  shizuoka: { original: "静岡県", jaHira: "しずおかけん", en: "Shizuoka" },
  aichi: { original: "愛知県", jaHira: "あいちけん", en: "Aichi" },
  mie: { original: "三重県", jaHira: "みえけん", en: "Mie" },
  shiga: { original: "滋賀県", jaHira: "しがけん", en: "Shiga" },
  kyoto: { original: "京都府", jaHira: "きょうとふ", en: "Kyoto" },
  osaka: { original: "大阪府", jaHira: "おおさかふ", en: "Osaka" },
  hyogo: { original: "兵庫県", jaHira: "ひょうごけん", en: "Hyogo" },
  nara: { original: "奈良県", jaHira: "ならけん", en: "Nara" },
  wakayama: { original: "和歌山県", jaHira: "わかやまけん", en: "Wakayama" },
  tottori: { original: "鳥取県", jaHira: "とっとりけん", en: "Tottori" },
  shimane: { original: "島根県", jaHira: "しまねけん", en: "Shimane" },
  okayama: { original: "岡山県", jaHira: "おかやまけん", en: "Okayama" },
  hiroshima: { original: "広島県", jaHira: "ひろしまけん", en: "Hiroshima" },
  yamaguchi: { original: "山口県", jaHira: "やまぐちけん", en: "Yamaguchi" },
  tokushima: { original: "徳島県", jaHira: "とくしまけん", en: "Tokushima" },
  kagawa: { original: "香川県", jaHira: "かがわけん", en: "Kagawa" },
  ehime: { original: "愛媛県", jaHira: "えひめけん", en: "Ehime" },
  kochi: { original: "高知県", jaHira: "こうちけん", en: "Kochi" },
  fukuoka: { original: "福岡県", jaHira: "ふくおかけん", en: "Fukuoka" },
  saga: { original: "佐賀県", jaHira: "さがけん", en: "Saga" },
  nagasaki: { original: "長崎県", jaHira: "ながさきけん", en: "Nagasaki" },
  kumamoto: { original: "熊本県", jaHira: "くまもとけん", en: "Kumamoto" },
  oita: { original: "大分県", jaHira: "おおいたけん", en: "Oita" },
  miyazaki: { original: "宮崎県", jaHira: "みやざきけん", en: "Miyazaki" },
  kagoshima: { original: "鹿児島県", jaHira: "かごしまけん", en: "Kagoshima" },
  okinawa: { original: "沖縄県", jaHira: "おきなわけん", en: "Okinawa" },
};

function getName(
  names: Readonly<Record<string, AttributeNames>>,
  code: string | null | undefined,
  displayLanguage: DisplayLanguage,
): string | undefined {
  if (!code) {
    return undefined;
  }

  return Object.hasOwn(names, code) ? names[code][displayLanguage] : code;
}

/** 性別コードを表示言語に合わせた名称へ変換する。未知のコードはそのまま返す。 */
export function getGenderName(
  gender: string | null | undefined,
  displayLanguage: DisplayLanguage,
): string | undefined {
  return getName(GENDER_NAMES, gender, displayLanguage);
}

/** 年代コードを表示言語に合わせた名称へ変換する。未知のコードはそのまま返す。 */
export function getAgeGroupName(
  ageGroup: string | null | undefined,
  displayLanguage: DisplayLanguage,
): string | undefined {
  return getName(AGE_GROUP_NAMES, ageGroup, displayLanguage);
}

/** 都道府県コードを表示言語に合わせた名称へ変換する。未知のコードはそのまま返す。 */
export function getRegionName(
  regionCode: string | null | undefined,
  displayLanguage: DisplayLanguage,
): string | undefined {
  return getName(REGION_NAMES, regionCode, displayLanguage);
}
