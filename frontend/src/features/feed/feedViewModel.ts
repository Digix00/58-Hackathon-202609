import type { FeedConcern, FeedItem } from './feedTypes'

const GENDER_LABELS: Record<string, string> = {
  female: '女性',
  male: '男性',
  non_binary: 'ノンバイナリー',
  other: 'その他',
  no_answer: '回答しない',
}

const AGE_GROUP_LABELS: Record<string, string> = {
  '10s': '10代',
  '20s': '20代',
  '30s': '30代',
  '40s': '40代',
  '50s': '50代',
  '60s': '60代',
  '70s': '70代',
  '80s': '80代',
  '90s_plus': '90代以上',
  no_answer: '年代は回答しない',
}

const REGION_LABELS: Record<string, string> = {
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

export const GENDER_OPTIONS = Object.entries(GENDER_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export const REGION_OPTIONS = Object.entries(REGION_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export function labelGender(value: string): string {
  return GENDER_LABELS[value] ?? value
}

export function labelAgeGroup(value: string): string {
  return AGE_GROUP_LABELS[value] ?? value
}

export function labelRegion(value: string): string {
  return REGION_LABELS[value] ?? value
}

export function toFeedConcern(item: FeedItem): FeedConcern {
  return {
    id: item.id,
    body: item.body,
    gender: item.attributes.gender ? labelGender(item.attributes.gender) : undefined,
    ageGroup: item.attributes.ageGroup ? labelAgeGroup(item.attributes.ageGroup) : undefined,
    region: item.attributes.regionCode ? labelRegion(item.attributes.regionCode) : undefined,
    createdLabel: formatCreatedLabel(item.createdAt),
    reactionCount: item.reactionCount,
    reacted: item.reacted,
  }
}

function formatCreatedLabel(createdAt: string): string {
  const timestamp = Date.parse(createdAt)
  if (Number.isNaN(timestamp)) return '日時不明'

  const elapsedDays = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000))
  if (elapsedDays === 0) return '今日'
  if (elapsedDays === 1) return '昨日'
  if (elapsedDays < 7) return `${elapsedDays}日前`
  if (elapsedDays < 31) return '今月'
  return 'しばらく前'
}
