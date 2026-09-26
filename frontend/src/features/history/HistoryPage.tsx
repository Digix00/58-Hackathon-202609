import { useTranslation } from '../../i18n/useTranslation'
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
import type { MessageKey } from '../../i18n/messages'

type AggregateDetail = 'regions' | 'clusters' | 'ageGroups' | 'genders' | 'viewedCount'
type Detail = AggregateDetail | 'quiz' | null

const dateFormatters: Record<string, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en', { timeZone: 'UTC' }),
  'ja-JP': new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC' }),
}

const detailTitles: Record<Exclude<Detail, null>, MessageKey> = {
  regions: 'history.regions',
  clusters: 'history.themes',
  ageGroups: 'history.ages',
  genders: 'history.genders',
  viewedCount: 'history.voices',
  quiz: 'history.quizzes',
}

function HistoryHeading() {
  const { t } = useTranslation()

  return (
    <header className={screen.heading}>
      <p className={screen.eyebrow}>{t('nav.history')}</p>
      <h1>{t('history.title')}</h1>
      <p className={screen.muted}>{t('history.description')}</p>
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
  const { t } = useTranslation()

  return (
    <section className={`${screen.paper} ${crayonStyles.edge}`}>
      <button type="button" className={actionStyles.text} onClick={onBack}>
        {t('history.back')}
      </button>
      <h2>{t(detailTitles[detail])}</h2>
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
  const { t, message, locale } = useTranslation()

  return (
    <div className={screen.stack}>
      <p>
        {t('history.quizSummary', {
          answered: model.quiz.answeredCount,
          correct: model.quiz.correctCount,
          total: model.quiz.totalQuestions,
          accuracy: Math.round(model.quiz.accuracy * 100),
        })}
      </p>
      {model.quizAnswers.length ? (
        <ul className={screen.list}>
          {model.quizAnswers.map((answer) => (
            <li className={screen.listItem} key={answer.quizId}>
              {dateFormatters[locale].format(new Date(answer.quizDate))}: {answer.score} /{' '}
              {t('common.questions', { count: answer.total })}
            </li>
          ))}
        </ul>
      ) : (
        <p className={screen.muted}>{t('history.noQuizzes')}</p>
      )}
      {error ? <p role="alert">{message(error)}</p> : null}
      {model.quizAnswersNextCursor ? (
        <button
          type="button"
          className={actionStyles.secondary}
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? t('common.loading') : t('history.loadMore')}
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
  const { t } = useTranslation()
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
      return (
        <p className={screen.muted}>{t('history.viewedCount', { count: model.viewedCount })}</p>
      )
  }
}

function HistoryCountList({
  items,
}: {
  items: Array<{ key?: string; label: string; count: number }>
}) {
  const { t } = useTranslation()

  return (
    <ul className={screen.list}>
      {items.length ? (
        items.map((item) => (
          <li className={screen.listItem} key={item.key ?? item.label}>
            {item.label} · {t('common.count', { count: item.count })}
          </li>
        ))
      ) : (
        <li>{t('history.noRecords')}</li>
      )}
    </ul>
  )
}

function HistoryUnavailableView() {
  const { t } = useTranslation()

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
      <h2>{t('history.unavailable')}</h2>
      <p className={screen.muted}>{t('history.accountUnavailable')}</p>
      <button type="button" className={actionStyles.primary} onClick={handleReturnToLine}>
        {t('history.returnLine')}
      </button>
    </section>
  )
}

function HistoryEmptyView({ feedPath }: { feedPath: string }) {
  const { t } = useTranslation()

  return (
    <section className={`${screen.paper} ${crayonStyles.edge}`}>
      <h2>{t('history.firstVoice')}</h2>
      <p className={screen.muted}>{t('history.emptyHint')}</p>
      <Link className={actionStyles.primary} to={feedPath}>
        {t('common.readVoices')}
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
  const { t } = useTranslation()

  const visibleRegions = regions.length
    ? regions
    : [{ code: 'quiz', label: t('nav.quiz'), count: 0 }]
  const activeRegion =
    selectedRegion && visibleRegions.some(({ code }) => code === selectedRegion)
      ? selectedRegion
      : visibleRegions[0].code
  return (
    <section className={screen.stack} aria-label={t('history.regionShelf')}>
      <div className={screen.shelf} role="group" aria-label={t('history.regionBookmarks')}>
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
          ? t('history.metRegion', {
              region: visibleRegions.find(({ code }) => code === activeRegion)?.label,
            })
          : t('history.quizDiscovery')}
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
  const { t } = useTranslation()

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
        <p className={screen.eyebrow}>{t('history.next')}</p>
        {model.nextSuggestion ? (
          <>
            <h2>
              {t(
                model.nextSuggestion.kind === 'theme'
                  ? 'history.unreadTheme'
                  : 'history.unreadRegion',
              )}
            </h2>
            <p className={screen.muted}>{model.nextSuggestion.label}</p>
            <Link className={actionStyles.text} to={feedPath}>
              {t('common.readVoicesArrow')}
            </Link>
          </>
        ) : (
          <>
            <h2>{t('history.noUnread')}</h2>
            <p className={screen.muted}>{t('history.newVoicesHint')}</p>
            <Link className={actionStyles.text} to={feedPath}>
              {t('common.viewFeedArrow')}
            </Link>
          </>
        )}
      </section>
      <Link className={actionStyles.text} to={quizPath}>
        {t('history.openQuiz')}
      </Link>
      <details className={screen.stack}>
        <summary>{t('history.more')}</summary>
        <div className={screen.stack}>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('regions')}
          >
            {t('history.regions')}
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('clusters')}
          >
            {t('history.themes')}
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('ageGroups')}
          >
            {t('history.ages')}
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('genders')}
          >
            {t('history.genders')}
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('viewedCount')}
          >
            {t('history.voices')}
          </button>
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={() => onOpenDetail('quiz')}
          >
            {t('history.quizzes')}
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
  const { t } = useTranslation()

  const { status, data, error, isLoadingMore, refresh, loadMoreQuizAnswers } = useHistory()
  const [detail, setDetail] = useState<Detail>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)

  return (
    <div className={screen.page}>
      <HistoryHeading />
      {status === 'loading' ? <LoadingState label={t('history.loading')} /> : null}
      {status === 'error' ? (
        <ErrorState
          description={error?.message ?? t('error.historyShort')}
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
