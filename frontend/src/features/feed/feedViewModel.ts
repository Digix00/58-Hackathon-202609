import { GENDERS, REGION_CODES, type Gender, type RegionCode } from '../post/postTypes'
import {
  ageGroupLabel,
  createdLabel,
  genderLabel,
  regionLabel,
} from '../../shared/concernPresentation'
import type { FeedItem } from './feedTypes'
import { RECOMMENDATION_REASON_LABELS } from './feedTypes'

export type FeedFilter = { gender: Gender | ''; region: RegionCode | '' }

export type FeedConcern = {
  id: string
  body: string
  gender?: string
  ageGroup?: string
  region?: string
  genderCode?: Gender
  regionCode?: RegionCode
  createdLabel: string
  reason: string
  reactionCount: number
  reacted: boolean
}

export type FeedFilterOption = { value: string; label: string }

/** しぼりこみなしを表す選択肢の値。属性値とは衝突しない。 */
export const ALL = '__all__'

export function toFeedConcern(item: FeedItem): FeedConcern {
  const reasonCode = item.recommendation?.reasonCode ?? 'newest'
  return {
    id: item.id,
    body: item.body,
    genderCode: item.attributes.gender as Gender | undefined,
    regionCode: item.attributes.regionCode as RegionCode | undefined,
    gender: genderLabel(item.attributes.gender),
    ageGroup: ageGroupLabel(item.attributes.ageGroup),
    region: regionLabel(item.attributes.regionCode),
    createdLabel: createdLabel(item.createdAt),
    reason: RECOMMENDATION_REASON_LABELS[reasonCode],
    reactionCount: item.reactionCount,
    reacted: item.reacted,
  }
}

export function buildFeedFilterOptions(): {
  genderOptions: FeedFilterOption[]
  regionOptions: FeedFilterOption[]
} {
  return {
    genderOptions: [
      { value: ALL, label: 'すべて' },
      ...GENDERS.map((gender) => ({ value: gender, label: genderLabel(gender) ?? gender })),
    ],
    regionOptions: [
      { value: ALL, label: 'すべて' },
      ...REGION_CODES.map((region) => ({ value: region, label: regionLabel(region) ?? region })),
    ],
  }
}

export function activeFeedFilterLabel(filter: FeedFilter): string {
  return [genderLabel(filter.gender), regionLabel(filter.region)].filter(Boolean).join(' · ')
}
