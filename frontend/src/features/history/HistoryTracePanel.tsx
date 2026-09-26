import { Link } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation'
import actionStyles from '../../shared/styles/Actions.module.css'
import screen from '../../shared/styles/Screen.module.css'
import styles from './HistoryPage.module.css'
import type { HistoryViewModel } from './historyViewModel'
import type { MessageKey } from '../../i18n/messages'

/** しおりを並べる棚。多いときは最初の数枚だけ出し、残りは折りたたむ。 */
const VISIBLE_MARKS = 6

const dateFormatters: Record<string, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en', { timeZone: 'UTC' }),
  'ja-JP': new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC' }),
}

type Mark = { key: string; label: string; count: number }

function Tally({ label, value }: { label: MessageKey; value: number }) {
  const { t } = useTranslation()

  return (
    <div className={styles.tally}>
      <span className={styles.tallyValue}>{value}</span>
      <span className={styles.tallyLabel}>{t(label)}</span>
    </div>
  )
}

function MarkShelf({ title, marks }: { title: MessageKey; marks: Mark[] }) {
  const { t } = useTranslation()
  const visible = marks.slice(0, VISIBLE_MARKS)
  const rest = marks.slice(VISIBLE_MARKS)

  return (
    <section className={styles.block} aria-labelledby={`history-shelf-${title}`}>
      <h3 className={styles.blockTitle} id={`history-shelf-${title}`}>
        {t(title)}
      </h3>
      {marks.length ? (
        <ul className={styles.marks}>
          {visible.map((mark) => (
            <li className={styles.mark} key={mark.key}>
              {mark.label}
              <span className={styles.markCount}>{t('common.count', { count: mark.count })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={screen.muted}>{t('history.shelfEmpty')}</p>
      )}
      {rest.length ? (
        <details className={styles.fold}>
          <summary>{t('history.more')}</summary>
          <ul className={styles.marks}>
            {rest.map((mark) => (
              <li className={styles.mark} key={mark.key}>
                {mark.label}
                <span className={styles.markCount}>{t('common.count', { count: mark.count })}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}

function AttributeFold({ model }: { model: HistoryViewModel }) {
  const { t } = useTranslation()

  return (
    <details className={styles.fold}>
      <summary>{t('history.attributeRecord')}</summary>
      <div className={styles.foldBody}>
        {(
          [
            { title: 'history.ages' as MessageKey, items: model.ageGroups },
            { title: 'history.genders' as MessageKey, items: model.genders },
          ] as const
        ).map(({ title, items }) => (
          <section key={title}>
            <h4 className={styles.blockTitle}>{t(title)}</h4>
            {items.length ? (
              <ul className={styles.marks}>
                {items.map((item) => (
                  <li className={styles.mark} key={item.label}>
                    {item.label}
                    <span className={styles.markCount}>
                      {t('common.count', { count: item.count })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={screen.muted}>{t('history.noRecords')}</p>
            )}
          </section>
        ))}
      </div>
    </details>
  )
}

function QuizRecord({
  model,
  error,
  isLoadingMore,
  onLoadMore,
  quizPath,
}: {
  model: HistoryViewModel
  error: string | null
  isLoadingMore: boolean
  onLoadMore: () => void
  quizPath: string
}) {
  const { t, message, locale } = useTranslation()

  return (
    <section className={styles.block} aria-labelledby="history-quiz-record">
      <h3 className={styles.blockTitle} id="history-quiz-record">
        {t('history.quizRecord')}
      </h3>
      {model.quiz.answeredCount ? (
        <p className={styles.sentence}>
          {t('history.quizSummary', {
            answered: model.quiz.answeredCount,
            correct: model.quiz.correctCount,
            total: model.quiz.totalQuestions,
            accuracy: Math.round(model.quiz.accuracy * 100),
          })}
        </p>
      ) : (
        <p className={screen.muted}>{t('history.noQuizzes')}</p>
      )}
      {model.quizAnswers.length ? (
        <details className={styles.fold}>
          <summary>{t('history.quizzes')}</summary>
          <div className={styles.foldBody}>
            <ul className={styles.records}>
              {model.quizAnswers.map((answer) => (
                <li className={styles.record} key={answer.quizId}>
                  <span>{dateFormatters[locale].format(new Date(answer.quizDate))}</span>
                  <span className={styles.recordScore}>
                    {answer.score} / {t('common.questions', { count: answer.total })}
                  </span>
                </li>
              ))}
            </ul>
            {error ? (
              <p className={styles.error} role="alert">
                {message(error)}
              </p>
            ) : null}
            {model.quizAnswersNextCursor ? (
              <button
                type="button"
                className={actionStyles.secondary}
                onClick={onLoadMore}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
              >
                {isLoadingMore ? t('common.loading') : t('history.loadMore')}
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
      <Link className={actionStyles.text} to={quizPath}>
        {t('history.openQuiz')}
      </Link>
    </section>
  )
}

function NextVoice({ model, feedPath }: { model: HistoryViewModel; feedPath: string }) {
  const { t } = useTranslation()

  return (
    <section className={styles.block} aria-labelledby="history-next">
      <p className={screen.eyebrow} id="history-next">
        {t('history.next')}
      </p>
      {model.nextSuggestion ? (
        <>
          <h3 className={styles.blockTitle}>
            {t(
              model.nextSuggestion.kind === 'theme'
                ? 'history.unreadTheme'
                : 'history.unreadRegion',
            )}
          </h3>
          <p className={styles.sentence}>{model.nextSuggestion.label}</p>
        </>
      ) : (
        <>
          <h3 className={styles.blockTitle}>{t('history.noUnread')}</h3>
          <p className={screen.muted}>{t('history.newVoicesHint')}</p>
        </>
      )}
      <Link className={actionStyles.text} to={feedPath}>
        {t('common.readVoicesArrow')}
      </Link>
    </section>
  )
}

/**
 * これまでのあしあと。数字を並べたダッシュボードにせず、
 * 記録の欄と、出会ったテーマ・地域のしおりとして読めるようにする。
 */
export function HistoryTracePanel({
  model,
  quizError,
  isLoadingMoreQuizzes,
  onLoadMoreQuizzes,
  feedPath,
  quizPath,
}: {
  model: HistoryViewModel
  quizError: string | null
  isLoadingMoreQuizzes: boolean
  onLoadMoreQuizzes: () => void
  feedPath: string
  quizPath: string
}) {
  const { t } = useTranslation()

  return (
    <div className={styles.panel}>
      <p className={styles.lead}>{t('history.traceLead')}</p>
      <div className={styles.tallies}>
        <Tally label="history.readTally" value={model.viewedCount} />
        <Tally label="history.wroteTally" value={model.contributions.concernCount} />
        <Tally label="history.supportedTally" value={model.contributions.givenReactionCount} />
        <Tally label="history.receivedTally" value={model.contributions.receivedReactionCount} />
      </div>
      <QuizRecord
        model={model}
        error={quizError}
        isLoadingMore={isLoadingMoreQuizzes}
        onLoadMore={onLoadMoreQuizzes}
        quizPath={quizPath}
      />
      <MarkShelf
        title="history.themeShelf"
        marks={model.clusters.map((cluster) => ({
          key: cluster.id,
          label: cluster.label,
          count: cluster.count,
        }))}
      />
      <MarkShelf
        title="history.regionShelf"
        marks={model.regions.map((region) => ({
          key: region.code,
          label: region.label,
          count: region.count,
        }))}
      />
      <AttributeFold model={model} />
      <NextVoice model={model} feedPath={feedPath} />
    </div>
  )
}
