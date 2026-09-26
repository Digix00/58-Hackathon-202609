import type { ConcernDetailResponse, ListConcernsResponse } from '../../lib/api'
import { RECOMMENDATION_REASON_LABELS } from '../feed/feedTypes'
import type { Gender, RegionCode } from '../post/postTypes'
import type { DemoConcern } from './demoStore'

type ApiConcern = ListConcernsResponse['items'][number] | ConcernDetailResponse

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
  no_answer: '回答しない',
}

const GENDER_LABELS: Record<string, string> = {
  male: '男性',
  female: '女性',
  non_binary: 'ノンバイナリー',
  other: 'その他',
  no_answer: '回答しない',
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

export function genderCodeForLabel(label: string): Gender | undefined {
  return codeForLabel(GENDER_LABELS, label) as Gender | undefined
}

export function regionCodeForLabel(label: string): RegionCode | undefined {
  return codeForLabel(REGION_LABELS, label) as RegionCode | undefined
}

export function toDemoConcern(item: ApiConcern): DemoConcern {
  const recommendation = 'recommendation' in item ? item.recommendation : undefined
  return {
    id: item.id,
    body: item.body,
    gender: labelFor(GENDER_LABELS, item.attributes.gender),
    genderCode: item.attributes.gender,
    ageGroup: labelFor(AGE_GROUP_LABELS, item.attributes.ageGroup),
    ageGroupCode: item.attributes.ageGroup,
    region: labelFor(REGION_LABELS, item.attributes.regionCode),
    regionCode: item.attributes.regionCode,
    createdLabel: formatCreatedLabel(item.createdAt),
    reason: recommendation
      ? RECOMMENDATION_REASON_LABELS[recommendation.reasonCode]
      : '新しく届いた声です',
    reactionCount: item.reactionCount,
    reacted: item.reacted,
  }
}

export function codeForLabel(labels: Record<string, string>, label: string): string | undefined {
  return Object.entries(labels).find(([, value]) => value === label)?.[0]
}

function labelFor(labels: Record<string, string>, code: string | undefined) {
  return code ? labels[code] : undefined
}

function formatCreatedLabel(value: string) {
  const createdAt = Date.parse(value)
  if (!Number.isFinite(createdAt)) return '最近'

  const days = Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000))
  if (days === 0) return '今日'
  if (days === 1) return '昨日'
  if (days < 7) return `${days}日前`
  if (days < 30) return '今月'
  return '少し前'
}
