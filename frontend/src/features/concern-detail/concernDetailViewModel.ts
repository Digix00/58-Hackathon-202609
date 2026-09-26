import type { ConcernDetailResponse } from '../../lib/api'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'
import {
  ageGroupLabel,
  createdLabel,
  genderLabel,
  regionLabel,
} from '../../shared/concernPresentation.ts'

export interface ConcernDetailViewModel {
  id: string
  body: string
  bodyLanguage: 'ja' | 'en'
  language: DisplayLanguage
  translationStatus?: 'pending' | 'ready' | 'failed'
  attributesLabel: string
  reactionCount: number
  reacted: boolean
}

export function toConcernDetailViewModel(
  concern: ConcernDetailResponse,
  language: DisplayLanguage,
): ConcernDetailViewModel {
  return {
    id: concern.id,
    body: concern.body,
    bodyLanguage: concern.language === 'en' ? 'en' : 'ja',
    language: concern.language,
    translationStatus: language === 'original' ? undefined : concern.representations[language],
    attributesLabel: [
      ageGroupLabel(concern.attributes.ageGroup, language),
      genderLabel(concern.attributes.gender, language),
      concern.attributes.regionName ?? regionLabel(concern.attributes.regionCode, language),
      createdLabel(concern.createdAt, language),
    ]
      .filter(Boolean)
      .join(' · '),
    reactionCount: concern.reactionCount,
    reacted: concern.reacted,
  }
}
