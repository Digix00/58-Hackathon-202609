import type { AgeGroup, Gender, RegionCode } from '../features/post/postTypes'
import type { DisplayLanguage } from '../app/providers/DisplaySettingsContext'

export const GENDER_LABELS: Record<Gender, string> = {
  male: '男性',
  female: '女性',
  non_binary: 'ノンバイナリー',
  other: 'その他',
  no_answer: '回答しない',
}

export const REGION_LABELS: Record<RegionCode, string> = {
  hokkaido: '北海道',
  aomori: '青森県',
  iwate: '岩手県',
  miyagi: '宮城県',
  akita: '秋田県',
  yamagata: '山形県',
  fukushima: '福島県',
  ibaraki: '茨城県',
  tochigi: '栃木県',
  gunma: '群馬県',
  saitama: '埼玉県',
  chiba: '千葉県',
  tokyo: '東京都',
  kanagawa: '神奈川県',
  niigata: '新潟県',
  toyama: '富山県',
  ishikawa: '石川県',
  fukui: '福井県',
  yamanashi: '山梨県',
  nagano: '長野県',
  gifu: '岐阜県',
  shizuoka: '静岡県',
  aichi: '愛知県',
  mie: '三重県',
  shiga: '滋賀県',
  kyoto: '京都府',
  osaka: '大阪府',
  hyogo: '兵庫県',
  nara: '奈良県',
  wakayama: '和歌山県',
  tottori: '鳥取県',
  shimane: '島根県',
  okayama: '岡山県',
  hiroshima: '広島県',
  yamaguchi: '山口県',
  tokushima: '徳島県',
  kagawa: '香川県',
  ehime: '愛媛県',
  kochi: '高知県',
  fukuoka: '福岡県',
  saga: '佐賀県',
  nagasaki: '長崎県',
  kumamoto: '熊本県',
  oita: '大分県',
  miyazaki: '宮崎県',
  kagoshima: '鹿児島県',
  okinawa: '沖縄県',
}

const REGION_HIRAGANA_LABELS: Record<RegionCode, string> = {
  hokkaido: 'ほっかいどう',
  aomori: 'あおもりけん',
  iwate: 'いわてけん',
  miyagi: 'みやぎけん',
  akita: 'あきたけん',
  yamagata: 'やまがたけん',
  fukushima: 'ふくしまけん',
  ibaraki: 'いばらきけん',
  tochigi: 'とちぎけん',
  gunma: 'ぐんまけん',
  saitama: 'さいたまけん',
  chiba: 'ちばけん',
  tokyo: 'とうきょうと',
  kanagawa: 'かながわけん',
  niigata: 'にいがたけん',
  toyama: 'とやまけん',
  ishikawa: 'いしかわけん',
  fukui: 'ふくいけん',
  yamanashi: 'やまなしけん',
  nagano: 'ながのけん',
  gifu: 'ぎふけん',
  shizuoka: 'しずおかけん',
  aichi: 'あいちけん',
  mie: 'みえけん',
  shiga: 'しがけん',
  kyoto: 'きょうとふ',
  osaka: 'おおさかふ',
  hyogo: 'ひょうごけん',
  nara: 'ならけん',
  wakayama: 'わかやまけん',
  tottori: 'とっとりけん',
  shimane: 'しまねけん',
  okayama: 'おかやまけん',
  hiroshima: 'ひろしまけん',
  yamaguchi: 'やまぐちけん',
  tokushima: 'とくしまけん',
  kagawa: 'かがわけん',
  ehime: 'えひめけん',
  kochi: 'こうちけん',
  fukuoka: 'ふくおかけん',
  saga: 'さがけん',
  nagasaki: 'ながさきけん',
  kumamoto: 'くまもとけん',
  oita: 'おおいたけん',
  miyazaki: 'みやざきけん',
  kagoshima: 'かごしまけん',
  okinawa: 'おきなわけん',
}

const REGION_ENGLISH_LABELS: Record<RegionCode, string> = {
  hokkaido: 'Hokkaido',
  aomori: 'Aomori',
  iwate: 'Iwate',
  miyagi: 'Miyagi',
  akita: 'Akita',
  yamagata: 'Yamagata',
  fukushima: 'Fukushima',
  ibaraki: 'Ibaraki',
  tochigi: 'Tochigi',
  gunma: 'Gunma',
  saitama: 'Saitama',
  chiba: 'Chiba',
  tokyo: 'Tokyo',
  kanagawa: 'Kanagawa',
  niigata: 'Niigata',
  toyama: 'Toyama',
  ishikawa: 'Ishikawa',
  fukui: 'Fukui',
  yamanashi: 'Yamanashi',
  nagano: 'Nagano',
  gifu: 'Gifu',
  shizuoka: 'Shizuoka',
  aichi: 'Aichi',
  mie: 'Mie',
  shiga: 'Shiga',
  kyoto: 'Kyoto',
  osaka: 'Osaka',
  hyogo: 'Hyogo',
  nara: 'Nara',
  wakayama: 'Wakayama',
  tottori: 'Tottori',
  shimane: 'Shimane',
  okayama: 'Okayama',
  hiroshima: 'Hiroshima',
  yamaguchi: 'Yamaguchi',
  tokushima: 'Tokushima',
  kagawa: 'Kagawa',
  ehime: 'Ehime',
  kochi: 'Kochi',
  fukuoka: 'Fukuoka',
  saga: 'Saga',
  nagasaki: 'Nagasaki',
  kumamoto: 'Kumamoto',
  oita: 'Oita',
  miyazaki: 'Miyazaki',
  kagoshima: 'Kagoshima',
  okinawa: 'Okinawa',
}

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  '10s': '10代',
  '20s': '20代',
  '30s': '30代',
  '40s': '40代',
  '50s': '50代',
  '60s': '60代',
  '70s': '70代',
  '80s': '80代',
  '90s_plus': '90代以上',
  no_answer: '回答しない',
}

export function genderLabel(code: string | undefined): string | undefined {
  return code ? (GENDER_LABELS[code as Gender] ?? code) : undefined
}

export function regionLabel(
  code: string | undefined,
  language: DisplayLanguage = 'original',
): string | undefined {
  if (!code) return undefined

  const regionCode = code as RegionCode
  if (language === 'jaHira') return REGION_HIRAGANA_LABELS[regionCode] ?? code
  if (language === 'en') return REGION_ENGLISH_LABELS[regionCode] ?? code
  return REGION_LABELS[regionCode] ?? code
}

export function ageGroupLabel(code: string | undefined): string | undefined {
  return code ? (AGE_GROUP_LABELS[code as AgeGroup] ?? code) : undefined
}

export function createdLabel(createdAt: string): string {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return ''

  const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000))
  if (days === 0) return '今日'
  if (days < 7) return `${days}日前`
  if (days < 31) return `${Math.floor(days / 7)}週間前`
  return `${Math.floor(days / 30)}か月前`
}
