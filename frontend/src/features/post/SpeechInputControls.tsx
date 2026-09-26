import { useEffect, useRef } from 'react'
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
  const actionsRef = useRef<HTMLDivElement>(null)
  const previousStatus = useRef(state.status)
  useEffect(() => {
    if (previousStatus.current !== state.status) {
      if (document.activeElement?.id !== 'post-body') {
        actionsRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
      }
      previousStatus.current = state.status
    }
  }, [state.status])
  return (
    <div className={styles.voiceControls}>
      {/* 音声入力を使えない環境でだけ、手入力へ切り替える案内を残す。 */}
      {speech.supported ? null : (
        <p id="post-voice-note" className={styles.voiceNote}>
          {t('speech.unsupported')}
        </p>
      )}
      <SpeechStatus state={state} />
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
      <div ref={actionsRef} className={styles.voiceActions}>
        {state.status === 'idle' || state.status === 'error' ? (
          <button
            type="button"
            className={styles.voiceButton}
            disabled={!speech.supported}
            aria-describedby={speech.supported ? undefined : 'post-voice-note'}
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

function SpeechStatus({ state }: { state: SpeechInput['state'] }) {
  const { t } = useTranslation()
  const labels = {
    idle: null,
    error: null,
    requesting: 'speech.requesting',
    recording: 'speech.recording',
    transcribing: 'speech.transcribing',
    review: 'speech.review',
  } as const
  const label = labels[state.status]
  return (
    <>
      <div role="status" aria-live="polite">
        {label ? t(label) : null}
      </div>
      {state.status === 'recording' ? <RecordingTime seconds={state.seconds} /> : null}
    </>
  )
}

/*
 * 録音の残り。
 * 紙にクレヨンで線を引きながら経過を示す。あと何秒話せるかを、数字を読み直さずに
 * つかめるようにするため。線は添えるだけで、秒数の言葉は必ず並べて置く。
 */
function RecordingTime({ seconds }: { seconds: number }) {
  const { t } = useTranslation()
  const drawn = Math.min(seconds / RECORDING_LIMIT_SECONDS, 1) * 100
  return (
    <p role="timer" className={styles.recordTimer}>
      <span className={styles.recordTrack} aria-hidden="true">
        <span className={styles.recordInk} style={{ width: `${drawn}%` }} />
      </span>
      <span className={styles.recordElapsed}>
        {/* 数え終わりの幅を先に取り、桁が増えても線の長さが動かないようにする。 */}
        <span className={styles.recordElapsedWidest} aria-hidden="true">
          {t('speech.elapsed', {
            seconds: RECORDING_LIMIT_SECONDS,
            max: RECORDING_LIMIT_SECONDS,
          })}
        </span>
        <span className={styles.recordElapsedValue}>
          {t('speech.elapsed', { seconds, max: RECORDING_LIMIT_SECONDS })}
        </span>
      </span>
    </p>
  )
}
