import { useState } from 'react'
import { Link } from 'react-router'
import { DemoBoundary } from '../../shared/components/DemoBoundary'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { useDemoState, type DemoConcern, type DemoQuizResult } from '../demo/demoStore'

type Detail = 'regions' | 'quiz' | null
type HistoryModel = {
  viewedCount: number
  regions: string[]
  hasNext: boolean
  quizResult: DemoQuizResult | null
}

function buildHistoryModel(
  concerns: DemoConcern[],
  viewedIds: ReadonlySet<string>,
  quizResult: DemoQuizResult | null,
): HistoryModel {
  const viewed = concerns.filter((concern) => viewedIds.has(concern.id))
  return {
    viewedCount: viewed.length,
    regions: [
      ...new Set(
        viewed.map((concern) => concern.region).filter((value): value is string => Boolean(value)),
      ),
    ],
    hasNext: concerns.some((concern) => !viewedIds.has(concern.id)),
    quizResult,
  }
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
}: {
  detail: Exclude<Detail, null>
  model: HistoryModel
  onBack: () => void
}) {
  const title = detail === 'regions' ? '出会った地域' : 'クイズの履歴'
  return (
    <section className={`${screen.paper} ${crayonStyles.edge}`}>
      <button type="button" className={actionStyles.text} onClick={onBack}>
        ← 振り返りに戻る
      </button>
      <h2>{title}</h2>
      {detail === 'quiz' ? (
        <p>
          {model.quizResult
            ? `今日のクイズ: ${model.quizResult.score} / 3組`
            : 'まだクイズに回答していません。'}
        </p>
      ) : (
        <ul className={screen.list}>
          {model.regions.length ? (
            model.regions.map((value) => (
              <li className={screen.listItem} key={value}>
                {value}
              </li>
            ))
          ) : (
            <li>まだ記録がありません。</li>
          )}
        </ul>
      )}
      {detail === 'regions' ? <p className={screen.muted}>読んだ声: {model.viewedCount}件</p> : null}
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
  regions: string[]
  selectedRegion: string | null
  onSelect: (region: string) => void
}) {
  const visibleRegions = regions.length ? regions : ['クイズ']
  const activeRegion =
    selectedRegion && visibleRegions.includes(selectedRegion) ? selectedRegion : visibleRegions[0]
  return (
    <section className={screen.stack} aria-label="出会った地域">
      <div className={screen.shelf} role="group" aria-label="出会った地域のしおり">
        {visibleRegions.slice(0, 4).map((region) => (
          <button
            key={region}
            type="button"
            className={screen.shelfMark}
            aria-pressed={region === activeRegion}
            onClick={() => onSelect(region)}
          >
            {region}
          </button>
        ))}
      </div>
      <p className={screen.muted} aria-live="polite">
        {regions.length
          ? `「${activeRegion}」の声に出会いました。`
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
  model: HistoryModel
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
        <h2>{model.hasNext ? 'まだ会っていない声' : 'すべての声に出会いました'}</h2>
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
            地域の傾向
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
  const { concerns, viewedIds, quizResult } = useDemoState()
  const [detail, setDetail] = useState<Detail>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const model = buildHistoryModel(concerns, viewedIds, quizResult)

  return (
    <DemoBoundary
      emptyTitle="最初の声を読んでみましょう"
      emptyDescription="読んだ声が、ここに少しずつ残ります。"
    >
      <div className={screen.page}>
        <HistoryHeading />
        {detail ? (
          <HistoryDetailView detail={detail} model={model} onBack={() => setDetail(null)} />
        ) : model.viewedCount === 0 && !model.quizResult ? (
          <HistoryEmptyView feedPath="/" />
        ) : (
          <HistoryOverviewView
            model={model}
            selectedRegion={selectedRegion}
            onSelectRegion={setSelectedRegion}
            onOpenDetail={setDetail}
            feedPath="/"
            quizPath="/quiz/today"
          />
        )}
      </div>
    </DemoBoundary>
  )
}
