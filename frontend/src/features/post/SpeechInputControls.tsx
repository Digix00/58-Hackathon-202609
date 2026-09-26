import { useTranslation } from '../../i18n/useTranslation'
import actionStyles from '../../shared/styles/Actions.module.css'
import { RECORDING_LIMIT_SECONDS } from './speechRecording'
import type { SpeechInput } from './useSpeechInput'
import styles from './PostPage.module.css'

export function SpeechInputControls({
  speech,
  onApply,
}: {
  speech: SpeechInput
  onApply: (text: string) => void
}) {
  const { t } = useTranslation()
  const { state } = speech
  return (
    <div className={styles.voiceControls}>
      <p id="post-voice-note" className={styles.voiceNote}>
        {t(speech.supported ? 'speech.hint' : 'speech.unsupported', {
          seconds: RECORDING_LIMIT_SECONDS,
        })}
      </p>
      <div role="status" aria-live="polite">
        {state.status === 'requesting' ? t('speech.requesting') : null}
        {state.status === 'recording' ? t('speech.recording') : null}
        {state.status === 'transcribing' ? t('speech.transcribing') : null}
        {state.status === 'review' ? t('speech.review') : null}
      </div>
      {state.status === 'recording' ? (
        <p role="timer" className={styles.voiceNote}>
          {t('speech.elapsed', { seconds: state.seconds, max: RECORDING_LIMIT_SECONDS })}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className={styles.error} role="alert">
          {t(state.message)}
        </p>
      ) : null}
      {state.status === 'review' ? (
        <p className={styles.transcript} lang="ja">
          {state.text}
        </p>
      ) : null}
      <div className={styles.voiceActions}>
        {state.status === 'idle' || state.status === 'error' ? (
          <button
            type="button"
            className={styles.voiceButton}
            disabled={!speech.supported}
            aria-describedby="post-voice-note"
            onClick={() => void speech.start()}
          >
            <svg className={styles.mic} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 3.3c1.8-.1 3.1 1.2 3.2 2.9v4.4c.1 1.8-1.3 3.2-3.1 3.2-1.8 0-3.2-1.3-3.2-3.1V6.4c0-1.7 1.3-3 3.1-3.1Z" />
              <path d="M6.5 11.3c.2 2.9 2.6 5.3 5.6 5.3 3 0 5.4-2.3 5.5-5.2M12 16.8c.1 1.2.1 2.3 0 3.4M9.3 20.4c1.9-.2 3.7-.2 5.5 0" />
            </svg>
            {t(state.status === 'error' ? 'speech.retry' : 'post.voice')}
          </button>
        ) : null}
        {state.status === 'recording' ? (
          <button type="button" className={styles.voiceButton} onClick={speech.stop}>
            {t('speech.stop')}
          </button>
        ) : null}
        {state.status === 'review' ? (
          <button type="button" className={styles.voiceButton} onClick={() => onApply(state.text)}>
            {t('speech.apply')}
          </button>
        ) : null}
        {speech.busy ? (
          <button type="button" className={actionStyles.text} onClick={speech.cancel}>
            {t(state.status === 'review' ? 'speech.discard' : 'speech.cancel')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
