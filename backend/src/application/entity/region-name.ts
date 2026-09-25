import type { RegionCode } from "./region-code";
import type { DisplayLanguage } from "./user";

type RegionNames = Record<DisplayLanguage, string>;

const REGION_NAMES: Record<RegionCode, RegionNames> = {
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

export function getRegionName(
  regionCode: string | null | undefined,
  displayLanguage: DisplayLanguage,
): string | undefined {
  if (!regionCode) {
    return undefined;
  }

  return (
    REGION_NAMES[regionCode as RegionCode]?.[displayLanguage] ?? regionCode
  );
}
