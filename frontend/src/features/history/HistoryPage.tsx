import { useState } from 'react'
import { Link } from 'react-router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { closeLineWindow } from '../../infrastructure/liff/client'
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { useHistory } from './useHistory'
import type { HistoryViewModel } from './historyViewModel'

type AggregateDetail = 'regions' | 'clusters' | 'ageGroups' | 'genders' | 'viewedCount'
type Detail = AggregateDetail | 'quiz' | null

const detailTitles: Record<Exclude<Detail, null>, string> = {
  regions: '都道府県の傾向',
  clusters: 'テーマの傾向',
  ageGroups: '投稿者の年代',
  genders: '投稿者の性別',
  viewedCount: '読んだ声の数',
  quiz: 'クイズの履歴',
}

function HistoryHeading() {
  return (
    <header className={screen.heading}>
      <p className={screen.eyebrow}>履歴</p>
      <h1>これまでに会った声。</h1>
      <p className={screen.muted}>これまでに触れた声を、ゆっくり振り返れます。</p>
    </header>
  )
}

function HistoryDetailView({
  detail,
  model,
  onBack,
  onLoadMore,
  isLoadingMore,
  errorMessage,
}: {
  detail: Exclude<Detail, null>
  model: HistoryViewModel
  onBack: () => void
  onLoadMore: () => void
  isLoadingMore: boolean
  errorMessage: string | null
}) {
  return (
    <section className={`${screen.paper} ${crayonStyles.edge}`}>
      <button type="button" className={actionStyles.text} onClick={onBack}>
        ← 振り返りに戻る
      </button>
      <h2>{detailTitles[detail]}</h2>
      {detail === 'quiz' ? (
        <QuizHistoryDetail
          model={model}
          onLoadMore={onLoadMore}
          isLoadingMore={isLoadingMore}
          error={errorMessage}
        />
      ) : (
        <HistoryAggregateDetail detail={detail} model={model} />
      )}
    </section>
  )
}

function QuizHistoryDetail({
  model,
  onLoadMore,
  isLoadingMore,
  error,
}: {
  model: HistoryViewModel
  onLoadMore: () => void
  isLoadingMore: boolean
  error: string | null
}) {
  return (
    <div className={screen.stack}>
      <p>
        回答 {model.quiz.answeredCount}回・正答 {model.quiz.correctCount} /{' '}
        {model.quiz.totalQuestions}問（正答率 {Math.round(model.quiz.accuracy * 100)}%）
      </p>
      {model.quizAnswers.length ? (
        <ul className={screen.list}>
          {model.quizAnswers.map((answer) => (
            <li className={screen.listItem} key={answer.quizId}>
              {answer.quizDate}: {answer.score} / {answer.total}問
            </li>
          ))}
        </ul>
      ) : (
        <p className={screen.muted}>まだクイズに回答していません。</p>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {model.quizAnswersNextCursor ? (
        <button
          type="button"
          className={actionStyles.secondary}
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? '読み込んでいます…' : '過去の履歴を読み込む'}
        </button>
      ) : null}
    </div>
  )
}

function HistoryAggregateDetail({
  detail,
  model,
}: {
  detail: AggregateDetail
  model: HistoryViewModel
}) {
  switch (detail) {
    case 'regions':
      return (
        <HistoryCountList
          items={model.regions.map((item) => ({
            key: item.code,
            label: item.label,
            count: item.count,
          }))}
        />
      )
    case 'clusters':
      return (
        <HistoryCountList
          items={model.clusters.map((item) => ({
            key: item.id,
            label: item.label,
            count: item.count,
          }))}
        />
      )
    case 'ageGroups':
      return <HistoryCountList items={model.ageGroups} />
    case 'genders':
      return <HistoryCountList items={model.genders} />
    case 'viewedCount':
      return <p className={screen.muted}>読んだ声: {model.viewedCount}件</p>
  }
}

function HistoryCountList({
  items,
}: {
  items: Array<{ key?: string; label: string; count: number }>
}) {
  return (
    <ul className={screen.list}>
      {items.length ? (
        items.map((item) => (
          <li className={screen.listItem} key={item.key ?? item.label}>
            {item.label} · {item.count}件
          </li>
        ))
      ) : (
        <li>まだ記録がありません。</li>
      )}
    </ul>
  )
}

function HistoryUnavailableView() {
  const { liffUrl } = useRuntime()
  const returnUrl = liffUrl('/') ?? '/'

  const handleReturnToLine = () => {
    try {
      if (closeLineWindow()) return
    } catch {
      // Use the LIFF URL as a fallback when the client cannot close the app.
    }
    window.location.assign(returnUrl)
  }

  return (
    <section className={`${screen.paper} ${crayonStyles.edge}`}>
      <h2>学習履歴を利用できません</h2>
      <p className={screen.muted}>このアカウントでは学習履歴を確認できません。</p>
      <button type="button" className={actionStyles.primary} onClick={handleReturnToLine}>
        LINEへ戻る
      </button>
    </section>
  )
}

function HistoryEmptyView({ feedPath }: { feedPath: string }) {
  return (
    <section className={`${screen.paper} ${crayonStyles.edge}`}>
      <h2>最初の声を読んでみましょう</h2>
      <p className={screen.muted}>読んだ地域やクイズの結果が、ここに残ります。</p>
      <Link className={actionStyles.primary} to={feedPath}>
        声を読む
      </Link>
    </section>
  )
}

function RegionShelf({
  regions,
  selectedRegion,
  onSelect,
}: {
  regions: HistoryViewModel['regions']
  selectedRegion: string | null
  onSelect: (region: string) => void
}) {
  const visibleRegions = regions.length ? regions : [{ code: 'quiz', label: 'クイズ', count: 0 }]
  const activeRegion =
    selectedRegion && visibleRegions.some(({ code }) => code === selectedRegion)
      ? selectedRegion
      : visibleRegions[0].code
  return (
    <section className={screen.stack} aria-label="出会った地域">
      <div className={screen.shelf} role="group" aria-label="出会った地域のしおり">
        {visibleRegions.slice(0, 4).map((region) => (
          <button
            key={region.code}
            type="button"
            className={screen.shelfMark}
            aria-pressed={region.code === activeRegion}
            onClick={() => onSelect(region.code)}
          >
            {region.label}
          </button>
        ))}
      </div>
      <p className={screen.muted} aria-live="polite">
        {regions.length
          ? `「${visibleRegions.find(({ code }) => code === activeRegion)?.label}」の声に出会いました。`
          : '今日のクイズで、違う立場の声を読みました。'}
      </p>
    </section>
  )
}

function HistoryOverviewView({
  model,
  selectedRegion,
  onSelectRegion,
  onOpenDetail,
  feedPath,
  quizPath,
}: {
  model: HistoryViewModel
  selectedRegion: string | null
  onSelectRegion: (region: string) => void
  onOpenDetail: (detail: Exclude<Detail, null>) => void
  feedPath: string
  quizPath: string
}) {
  return (
    <>
      <RegionShelf
        regions={model.regions}
        selectedRegion={selectedRegion}
        onSelect={onSelectRegion}
      />
      <section
        className={`${screen.paper} ${screen.taped} ${screen.tapeRight} ${crayonStyles.edge}`}
      >
        <p className={screen.eyebrow}>つぎに、ひらくなら</p>
        <h2>まだ読んでいない声を探してみましょう</h2>
        <Link className={actionStyles.text} to={feedPath}>
          読んでみる →
        </Link>
      </section>
      <Link className={actionStyles.text} to={quizPath}>
        きょうの手紙をひらく
      </Link>
      <details className={screen.stack}>
        <summary>もっと見る</summary>
        <div className={screen.stack}>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('regions')}
          >
            都道府県の傾向
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('clusters')}
          >
            テーマの傾向
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('ageGroups')}
          >
            投稿者の年代
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('genders')}
          >
            投稿者の性別
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('viewedCount')}
          >
            読んだ声の数
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('quiz')}
          >
            クイズの履歴
          </button>
        </div>
      </details>
    </>
  )
}

export function HistoryPage() {
  return <HistoryContent />
}

function HistoryContent() {
  const { status, data, error, isLoadingMore, refresh, loadMoreQuizAnswers } = useHistory()
  const [detail, setDetail] = useState<Detail>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)

  return (
    <div className={screen.page}>
      <HistoryHeading />
      {status === 'loading' ? <LoadingState label="履歴を読み込んでいます…" /> : null}
      {status === 'error' ? (
        <ErrorState
          description={error?.message ?? '履歴を読み込めませんでした。'}
          onRetry={() => void refresh()}
        />
      ) : null}
      {status === 'unavailable' ? <HistoryUnavailableView /> : null}
      {status === 'success' && data ? (
        detail ? (
          <HistoryDetailView
            detail={detail}
            model={data}
            onBack={() => setDetail(null)}
            onLoadMore={() => void loadMoreQuizAnswers()}
            isLoadingMore={isLoadingMore}
            errorMessage={error?.message ?? null}
          />
        ) : data.viewedCount === 0 && data.quiz.answeredCount === 0 ? (
          <HistoryEmptyView feedPath="/" />
        ) : (
          <HistoryOverviewView
            model={data}
            selectedRegion={selectedRegion}
            onSelectRegion={setSelectedRegion}
            onOpenDetail={setDetail}
            feedPath="/"
            quizPath="/quiz/today"
          />
        )
      ) : null}
    </div>
  )
}
