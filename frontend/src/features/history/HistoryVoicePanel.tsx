import { Link } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation'
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import { TranslationNotice } from '../../shared/components/TranslationNotice'
import actionStyles from '../../shared/styles/Actions.module.css'
import screen from '../../shared/styles/Screen.module.css'
import styles from './HistoryPage.module.css'
import type { HistoryVoiceView } from './historyViewModel'
import type { HistoryVoiceSource, UseHistoryVoicesResult } from './useHistoryVoices'
import type { MessageKey } from '../../i18n/messages'

/** 見出しごとに変わる文言だけをまとめ、一覧の組み方は共通にする。 */
const TEXTS: Record<
  HistoryVoiceSource,
  {
    lead: MessageKey
    when: MessageKey
    emptyTitle: MessageKey
    emptyHint: MessageKey
    emptyAction: MessageKey
    emptyPath: string
    error: MessageKey
  }
> = {
  own: {
    lead: 'history.ownLead',
    when: 'history.wroteAt',
    emptyTitle: 'history.ownEmpty',
    emptyHint: 'history.ownEmptyHint',
    emptyAction: 'history.writeVoice',
    emptyPath: '/post',
    error: 'error.historyConcerns',
  },
  supported: {
    lead: 'history.supportedLead',
    when: 'history.supportedAt',
    emptyTitle: 'history.supportedEmpty',
    emptyHint: 'history.supportedEmptyHint',
    emptyAction: 'common.readVoices',
    emptyPath: '/',
    error: 'error.historyReactions',
  },
}

function VoiceCard({ voice, when }: { voice: HistoryVoiceView; when: MessageKey }) {
  const { t } = useTranslation()

  return (
    <li className={styles.voice}>
      {voice.theme || voice.ageGroup || voice.region ? (
        <p className={styles.voiceTags}>
          {voice.theme ? <span className={styles.themeMark}>{voice.theme}</span> : null}
          {voice.ageGroup ? <span className={styles.tag}>{voice.ageGroup}</span> : null}
          {voice.region ? <span className={styles.tag}>{voice.region}</span> : null}
        </p>
      ) : null}
      <Link
        className={styles.voiceLink}
        to={`/concerns/${encodeURIComponent(voice.id)}`}
        aria-label={t('history.openVoice', { body: voice.body })}
      >
        <span className={styles.voiceBody} lang={voice.language === 'en' ? 'en' : 'ja'}>
          {voice.body}
        </span>
      </Link>
      <p className={styles.voiceMeta}>
        <span>{t(when, { when: voice.whenLabel })}</span>
        <span className={styles.voiceSupport}>
          {t('history.supportTally', { count: voice.reactionCount })}
        </span>
        <span className={styles.voiceOpen} aria-hidden="true">
          {t('history.openMark')}
        </span>
      </p>
      {voice.state === 'published' ? null : (
        <p className={styles.voiceNote}>
          {t(voice.state === 'hidden' ? 'history.notPublished' : 'history.preparing')}
        </p>
      )}
      <TranslationNotice actualLanguage={voice.language} status={voice.translationStatus} />
    </li>
  )
}

function VoicesEmpty({ source }: { source: HistoryVoiceSource }) {
  const { t } = useTranslation()
  const texts = TEXTS[source]

  return (
    <div className={styles.empty}>
      <h3 className={styles.blockTitle}>{t(texts.emptyTitle)}</h3>
      <p className={screen.muted}>{t(texts.emptyHint)}</p>
      <Link className={actionStyles.primary} to={texts.emptyPath}>
        {t(texts.emptyAction)}
      </Link>
    </div>
  )
}

/**
 * 書いた声・寄りそった声の索引。
 * 本文は抜粋にとどめ、読み返しは投稿詳細へ渡す。
 */
export function HistoryVoicePanel({
  source,
  total,
  voices,
  status,
  hasMore,
  error,
  loadMore,
  retry,
}: { source: HistoryVoiceSource; total: number } & UseHistoryVoicesResult) {
  const { t, message } = useTranslation()
  const texts = TEXTS[source]

  if (status === 'idle' || status === 'loading') {
    return <LoadingState label={t('history.voicesLoading')} />
  }
  if (status === 'error') {
    return <ErrorState description={error?.message ?? texts.error} onRetry={() => void retry()} />
  }
  if (!voices.length) return <VoicesEmpty source={source} />

  return (
    <div className={styles.panel}>
      <p className={styles.lead}>{t(texts.lead, { count: total || voices.length })}</p>
      <ul className={styles.voices}>
        {voices.map((voice) => (
          <VoiceCard key={voice.id} voice={voice} when={texts.when} />
        ))}
      </ul>
      {error ? (
        <p className={styles.error} role="alert">
          {message(error.message)}
        </p>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          className={actionStyles.secondary}
          onClick={() => void loadMore()}
          disabled={status === 'loadingMore'}
          aria-busy={status === 'loadingMore'}
        >
          {status === 'loadingMore' ? t('common.loading') : t('history.loadMoreVoices')}
        </button>
      ) : null}
    </div>
  )
}
