import { useTranslation } from '../../i18n/useTranslation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDailyBroadcastStatus,
  LineBroadcastApiError,
  triggerDailyBroadcast,
  type DailyBroadcastStatus,
} from './lineBroadcastApi'
import styles from './LineBroadcastPage.module.css'

const timeFormatters: Record<string, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }),
  'ja-JP': new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }),
}

export function LineBroadcastPage() {
  const { t } = useTranslation()

  const { status, loading, triggering, error, isSimulation, refresh, trigger } =
    useLineBroadcastPageState()

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>{t('broadcast.section')}</p>
        <h1>{t('broadcast.title')}</h1>
        <p className={styles.description}>{t('broadcast.schedule')}</p>
      </header>

      <section className={styles.card} aria-labelledby="broadcast-status-title" aria-busy={loading}>
        <h2 id="broadcast-status-title">{t('broadcast.status')}</h2>
        <BroadcastStatusContent loading={loading} status={status} error={error} />
        <BroadcastActions
          loading={loading}
          triggering={triggering}
          isSimulation={isSimulation}
          onTrigger={trigger}
          onRefresh={refresh}
        />
      </section>

      <DeliveryModeNote isSimulation={isSimulation} />
    </main>
  )
}

function useLineBroadcastPageState() {
  const [status, setStatus] = useState<DailyBroadcastStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingStatusRequest = useRef<Promise<DailyBroadcastStatus | null> | null>(null)

  const loadStatus = useCallback(async () => {
    if (pendingStatusRequest.current) return pendingStatusRequest.current

    const request = (async () => {
      try {
        const nextStatus = await getDailyBroadcastStatus()
        setStatus(nextStatus)
        setError(null)
        return nextStatus
      } catch (cause) {
        setError(toMessage(cause))
        return null
      } finally {
        setLoading(false)
        pendingStatusRequest.current = null
      }
    })()
    pendingStatusRequest.current = request
    return request
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatus(), 0)
    return () => window.clearTimeout(timer)
  }, [loadStatus])

  useEffect(() => {
    if (status?.broadcastStatus !== 'running') return

    let active = true
    let timer: number | undefined
    const poll = async () => {
      const nextStatus = await loadStatus()
      if (!active) return

      // APIエラー時は画面のrunning状態を保ち、次の周期で再取得する。
      if (!nextStatus || nextStatus.broadcastStatus === 'running') {
        timer = window.setTimeout(() => void poll(), 5_000)
      }
    }

    timer = window.setTimeout(() => void poll(), 5_000)
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [loadStatus, status?.broadcastStatus])

  const refresh = async () => {
    setLoading(true)
    await loadStatus()
  }

  const trigger = async () => {
    setTriggering(true)
    setError(null)
    try {
      await triggerDailyBroadcast()
      await loadStatus()
    } catch (cause) {
      const triggerError = toMessage(cause)
      setError(triggerError)
      await loadStatus()
      // Keep the trigger error if the status refresh also failed.
      setError(triggerError)
    } finally {
      setTriggering(false)
    }
  }

  return {
    status,
    loading,
    triggering,
    error,
    isSimulation: status?.deliveryMode === 'simulation',
    refresh,
    trigger,
  }
}

function BroadcastStatusContent({
  loading,
  status,
  error,
}: {
  loading: boolean
  status: DailyBroadcastStatus | null
  error: string | null
}) {
  const { t, message } = useTranslation()

  return (
    <>
      {loading && !status ? <p className={styles.status}>{t('broadcast.loading')}</p> : null}
      {status ? <BroadcastStatusDetails status={status} /> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {message(error)}
        </p>
      ) : null}
    </>
  )
}

function BroadcastStatusDetails({ status }: { status: DailyBroadcastStatus }) {
  const { t, message, locale } = useTranslation()

  return (
    <>
      <p className={styles.status}>{message(statusLabel(status))}</p>
      <p className={styles.note}>{message(statusDetail(status))}</p>
      {status.requestedAt ? (
        <p className={styles.timestamp}>
          {t('broadcast.requested')} {formatTime(status.requestedAt, locale)}
        </p>
      ) : null}
      {status.sentAt ? (
        <p className={styles.timestamp}>
          {status.deliveryMode === 'simulation'
            ? t('broadcast.simulated')
            : t('broadcast.accepted')}
          : {formatTime(status.sentAt, locale)}
        </p>
      ) : null}
    </>
  )
}

function BroadcastActions({
  loading,
  triggering,
  isSimulation,
  onTrigger,
  onRefresh,
}: {
  loading: boolean
  triggering: boolean
  isSimulation: boolean
  onTrigger: () => void
  onRefresh: () => void
}) {
  const { t, message } = useTranslation()

  return (
    <div className={styles.actions}>
      <button
        className={styles.button}
        type="button"
        onClick={() => void onTrigger()}
        disabled={triggering || loading}
      >
        {message(triggerButtonLabel(triggering, isSimulation))}
      </button>
      <button
        className={`${styles.button} ${styles.secondary}`}
        type="button"
        onClick={() => void onRefresh()}
        disabled={loading || triggering}
      >
        {t('broadcast.refresh')}
      </button>
    </div>
  )
}

function DeliveryModeNote({ isSimulation }: { isSimulation: boolean }) {
  const { t } = useTranslation()

  return (
    <p className={styles.note}>
      {isSimulation ? t('broadcast.simulationNote') : t('broadcast.acceptedNote')}
    </p>
  )
}

function triggerButtonLabel(triggering: boolean, isSimulation: boolean): string {
  if (triggering) {
    return isSimulation ? 'broadcast.simulating' : 'broadcast.triggering'
  }
  return isSimulation ? 'broadcast.simulate' : 'broadcast.trigger'
}

function statusLabel(status: DailyBroadcastStatus): string {
  if (status.quizStatus === 'missing') return 'broadcast.noQuiz'
  switch (status.broadcastStatus) {
    case 'not_started':
    case 'pending':
      return 'broadcast.notStarted'
    case 'running':
      return status.deliveryMode === 'simulation'
        ? 'broadcast.simulationRunning'
        : 'broadcast.running'
    case 'succeeded':
      return status.deliveryMode === 'simulation'
        ? 'broadcast.simulationSucceeded'
        : 'broadcast.succeeded'
    case 'failed':
      return 'broadcast.failed'
  }
}

function statusDetail(status: DailyBroadcastStatus): string {
  if (status.quizStatus === 'missing') {
    return 'broadcast.missingDetail'
  }
  if (status.broadcastStatus === 'running') {
    return status.deliveryMode === 'simulation'
      ? 'broadcast.simulationRunningDetail'
      : 'broadcast.runningDetail'
  }
  if (status.broadcastStatus === 'succeeded') {
    return status.deliveryMode === 'simulation'
      ? 'broadcast.simulationSucceededDetail'
      : 'broadcast.succeededDetail'
  }
  if (status.broadcastStatus === 'failed') {
    return 'broadcast.failedDetail'
  }
  return 'broadcast.pendingDetail'
}

function formatTime(value: string, locale: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : timeFormatters[locale].format(date)
}

function toMessage(error: unknown): string {
  if (error instanceof LineBroadcastApiError) {
    if (error.code === 'ADMIN_ACCESS_REQUIRED') return 'broadcast.login'
    if (error.code === 'QUIZ_NOT_AVAILABLE') return 'broadcast.quizFailed'
    return error.message
  }
  return 'broadcast.statusFailed'
}
