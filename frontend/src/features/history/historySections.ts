import type { MessageKey } from '../../i18n/messages'

/** 履歴の見出し。あしあと・かいた声・よりそった声の3枚だけを持つ。 */
export const HISTORY_SECTIONS = ['trace', 'own', 'supported'] as const

export type HistorySection = (typeof HISTORY_SECTIONS)[number]

export const HISTORY_SECTION_LABELS: Record<HistorySection, MessageKey> = {
  trace: 'history.tabTrace',
  own: 'history.tabOwn',
  supported: 'history.tabSupported',
}
