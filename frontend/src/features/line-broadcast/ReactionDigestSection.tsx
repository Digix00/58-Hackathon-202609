import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n/useTranslation'
import {
  getReactionDigestStatus,
  LineBroadcastApiError,
  triggerReactionDigest,
  type ReactionDigestRun,
  type ReactionDigestStatus,
} from './lineBroadcastApi'
import styles from './LineBroadcastPage.module.css'
import { formatTime } from './formatTime'

/** 寄りそい通知の直近の実行状況と、任意のタイミングで送る操作。 */
export function ReactionDigestSection() {
  const { t } = useTranslation()
  const { status, loading, sending, error, refresh, send } = useReactionDigestState()
  const latest = status?.runs[0] ?? null
  const isSimulation = status?.deliveryMode === 'simulation'

  return (
    <section className={styles.card} aria-labelledby="reaction-digest-title" aria-busy={loading}>
      <h2 id="reaction-digest-title">{t('digest.title')}</h2>
      <p className={styles.description}>{t('digest.schedule')}</p>
      <LatestRun loading={loading} run={latest} hasStatus={status !== null} error={error} />
      <div className={styles.actions}>
        <button
          className={styles.button}
          type="button"
          onClick={() => void send()}
          disabled={sending || loading}
        >
          {t(sendButtonLabel(sending, isSimulation, latest))}
        </button>
        <button
          className={`${styles.button} ${styles.secondary}`}
          type="button"
          onClick={() => void refresh()}
          disabled={loading || sending}
        >
          {t('broadcast.refresh')}
        </button>
      </div>
      {status && status.runs.length > 1 ? <RecentRuns runs={status.runs.slice(1, 5)} /> : null}
      <p className={styles.note}>{isSimulation ? t('digest.simulationNote') : t('digest.note')}</p>
    </section>
  )
}

function useReactionDigestState() {
  const [status, setStatus] = useState<ReactionDigestStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRequest = useRef<Promise<void> | null>(null)

  const load = useCallback(async () => {
    if (pendingRequest.current) return pendingRequest.current

    const request = (async () => {
      try {
        setStatus(await getReactionDigestStatus())
        setError(null)
      } catch (cause) {
        setError(toMessage(cause, 'digest.statusFailed'))
      } finally {
        setLoading(false)
        pendingRequest.current = null
      }
    })()
    pendingRequest.current = request
    return request
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const refresh = async () => {
    setLoading(true)
    await load()
  }

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      await triggerReactionDigest()
      await load()
    } catch (cause) {
      const sendError = toMessage(cause, 'broadcast.requestFailed')
      await load()
      // 状態の再取得に成功しても、送信操作のエラーを表示し続ける。
      setError(sendError)
    } finally {
      setSending(false)
    }
  }

  return { status, loading, sending, error, refresh, send }
}

function LatestRun({
  loading,
  run,
  hasStatus,
  error,
}: {
  loading: boolean
  run: ReactionDigestRun | null
  hasStatus: boolean
  error: string | null
}) {
  const { t, message } = useTranslation()

  return (
    <div>
      {loading && !hasStatus ? <p className={styles.status}>{t('broadcast.loading')}</p> : null}
      {hasStatus && !run ? <p className={styles.status}>{t('digest.none')}</p> : null}
      {run ? (
        <>
          <p className={styles.note}>{t('digest.latest')}</p>
          <p className={styles.status}>{t(runStatusLabel(run))}</p>
          <RunSummary run={run} />
        </>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {message(error)}
        </p>
      ) : null}
    </div>
  )
}

function RecentRuns({ runs }: { runs: ReactionDigestRun[] }) {
  const { t } = useTranslation()

  return (
    <div>
      <h3 className={styles.note}>{t('digest.history')}</h3>
      <ul>
        {runs.map((run) => (
          <li key={run.runId}>
            <strong>{t(runStatusLabel(run))}</strong>
            <RunSummary run={run} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function RunSummary({ run }: { run: ReactionDigestRun }) {
  const { t, locale, language } = useTranslation()
  const timeLocale = language === 'jaHira' ? 'jaHira' : locale

  return (
    <>
      <p className={styles.note}>
        {t('digest.counts', {
          target: run.targetCount,
          sent: run.sentCount,
          failed: run.failedCount,
          skipped: run.skippedCount,
          remaining: run.remainingCount,
        })}
      </p>
      <p className={styles.timestamp}>
        {t(run.trigger === 'cron' ? 'digest.cron' : 'digest.manual')} ・ {t('digest.requested')}{' '}
        {formatTime(run.requestedAt, timeLocale)}
      </p>
    </>
  )
}

function runStatusLabel(run: ReactionDigestRun) {
  switch (run.status) {
    case 'pending':
      return 'digest.pending'
    case 'running':
      return 'digest.running'
    case 'succeeded':
      return 'digest.succeeded'
    case 'partially_failed':
      return 'digest.partiallyFailed'
    case 'failed':
      return 'digest.failed'
  }
}

function sendButtonLabel(
  sending: boolean,
  isSimulation: boolean,
  latest: ReactionDigestRun | null,
) {
  if (sending) return 'digest.sending'
  if (latest?.status === 'pending') return 'digest.continue'
  return isSimulation ? 'digest.simulate' : 'digest.send'
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof LineBroadcastApiError) {
    if (error.code === 'ADMIN_ACCESS_REQUIRED') return 'broadcast.login'
    if (error.code === 'REACTION_DIGEST_IN_PROGRESS') return 'digest.inProgress'
    return error.message
  }
  return fallback
}
