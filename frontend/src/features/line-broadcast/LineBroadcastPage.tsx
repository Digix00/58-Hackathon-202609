import { useCallback, useEffect, useState } from 'react'
import {
  getDailyBroadcastStatus,
  LineBroadcastApiError,
  triggerDailyBroadcast,
  type DailyBroadcastStatus,
} from './lineBroadcastApi'
import styles from './LineBroadcastPage.module.css'

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tokyo',
})

export function LineBroadcastPage() {
  const { status, loading, triggering, error, isSimulation, refresh, trigger } =
    useLineBroadcastPageState()

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>運用</p>
        <h1>今日のクイズ配信</h1>
        <p className={styles.description}>
          毎日 09:00 JST にクイズ生成を試みます。本番ではLINE配信し、開発環境では送信を模擬します。
        </p>
      </header>

      <section className={styles.card} aria-labelledby="broadcast-status-title" aria-busy={loading}>
        <h2 id="broadcast-status-title">配信状況</h2>
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

  const loadStatus = useCallback(async () => {
    try {
      const nextStatus = await getDailyBroadcastStatus()
      setStatus(nextStatus)
      setError(null)
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatus(), 0)
    return () => window.clearTimeout(timer)
  }, [loadStatus])

  useEffect(() => {
    if (status?.broadcastStatus !== 'running') return
    const timer = window.setTimeout(() => void loadStatus(), 5_000)
    return () => window.clearTimeout(timer)
  }, [loadStatus, status?.broadcastStatus])

  const refresh = async () => {
    setLoading(true)
    await loadStatus()
  }

  const trigger = async () => {
    setTriggering(true)
    setError(null)
    try {
      setStatus(await triggerDailyBroadcast())
    } catch (cause) {
      setError(toMessage(cause))
      try {
        setStatus(await getDailyBroadcastStatus())
      } catch {
        // Keep the original operation error; the refresh error adds no useful detail.
      }
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
  return (
    <>
      {loading && !status ? <p className={styles.status}>読み込み中…</p> : null}
      {status ? <BroadcastStatusDetails status={status} /> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  )
}

function BroadcastStatusDetails({ status }: { status: DailyBroadcastStatus }) {
  return (
    <>
      <p className={styles.status}>{statusLabel(status)}</p>
      <p className={styles.note}>{statusDetail(status)}</p>
      {status.requestedAt ? (
        <p className={styles.timestamp}>受付処理開始: {formatTime(status.requestedAt)}</p>
      ) : null}
      {status.sentAt ? (
        <p className={styles.timestamp}>
          {status.deliveryMode === 'simulation' ? '模擬受付' : 'LINE API受付'}:{' '}
          {formatTime(status.sentAt)}
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
  return (
    <div className={styles.actions}>
      <button
        className={styles.button}
        type="button"
        onClick={() => void onTrigger()}
        disabled={triggering || loading}
      >
        {triggerButtonLabel(triggering, isSimulation)}
      </button>
      <button
        className={`${styles.button} ${styles.secondary}`}
        type="button"
        onClick={() => void onRefresh()}
        disabled={loading || triggering}
      >
        状況を更新
      </button>
    </div>
  )
}

function DeliveryModeNote({ isSimulation }: { isSimulation: boolean }) {
  return (
    <p className={styles.note}>
      {isSimulation
        ? '開発用シミュレーションです。LINEへは送信せず、配信処理と状態表示だけを確認できます。'
        : '「LINE API受付済み」はLINEが一斉配信リクエストを受け付けた状態です。友だち一人ひとりへの到達状況は表示しません。'}
    </p>
  )
}

function triggerButtonLabel(triggering: boolean, isSimulation: boolean): string {
  if (triggering) {
    return isSimulation ? '生成・模擬配信しています…' : '生成・配信しています…'
  }
  return isSimulation ? '今日のクイズを生成して模擬配信' : '今日のクイズを生成して配信'
}

function statusLabel(status: DailyBroadcastStatus): string {
  if (status.quizStatus === 'missing') return '公開クイズがありません'
  switch (status.broadcastStatus) {
    case 'not_started':
    case 'pending':
      return '今日の配信はまだありません'
    case 'running':
      return status.deliveryMode === 'simulation' ? '模擬配信処理中' : '配信処理中'
    case 'succeeded':
      return status.deliveryMode === 'simulation' ? '開発用の模擬配信完了' : 'LINE API受付済み'
    case 'failed':
      return '配信に失敗しました'
  }
}

function statusDetail(status: DailyBroadcastStatus): string {
  if (status.quizStatus === 'missing') {
    return '今日のクイズ生成はまだ完了していません。手動実行すると生成を試みてから配信します。'
  }
  if (status.broadcastStatus === 'running') {
    return status.deliveryMode === 'simulation'
      ? 'LINEへ送信せず、開発用の模擬配信を処理しています。状態は自動で更新されます。'
      : '配信中、またはLINEの受付結果を確認しています。状態は自動で更新されます。'
  }
  if (status.broadcastStatus === 'succeeded') {
    return status.deliveryMode === 'simulation'
      ? '開発用の模擬配信が完了しました。LINEには送信されていません。'
      : 'LINEが一斉配信リクエストを受け付けました。'
  }
  if (status.broadcastStatus === 'failed') {
    return 'LINEへの配信が失敗しました。再実行すると同じ日付の配信として再試行します。'
  }
  return '手動実行では、公開済みクイズがあればそのまま配信し、なければ生成を試みます。'
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function toMessage(error: unknown): string {
  if (error instanceof LineBroadcastApiError) {
    if (error.code === 'ADMIN_ACCESS_REQUIRED')
      return 'Cloudflare Accessで管理者ログインしてください。'
    if (error.code === 'QUIZ_NOT_AVAILABLE')
      return '今日の公開クイズを用意できませんでした。投稿候補を確認してください。'
    return error.message
  }
  return '配信状況を取得できませんでした。'
}
