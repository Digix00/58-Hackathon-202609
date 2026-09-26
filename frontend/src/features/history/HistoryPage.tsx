import { useState } from 'react'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { closeLineWindow } from '../../infrastructure/liff/client'
import { HistoryTracePanel } from './HistoryTracePanel'
import { HistoryVoicePanel } from './HistoryVoicePanel'
import { HistoryView } from './HistoryView'
import type { HistorySection } from './historySections'
import { useHistory } from './useHistory'
import { useHistoryVoices } from './useHistoryVoices'
import type { HistoryViewModel } from './historyViewModel'

const FEED_PATH = '/'
const QUIZ_PATH = '/quiz/today'

/** 読んだ・書いた・寄りそったのすべてが空なら、最初の1件へ案内する。 */
function isBlankHistory(model: HistoryViewModel): boolean {
  return (
    model.viewedCount === 0 &&
    model.quiz.answeredCount === 0 &&
    model.contributions.concernCount === 0 &&
    model.contributions.givenReactionCount === 0
  )
}

export function HistoryPage() {
  return <HistoryContent />
}

function HistoryContent() {
  const { liffUrl } = useRuntime()
  const [section, setSection] = useState<HistorySection>('trace')
  const { status, data, error, isLoadingMore, refresh, loadMoreQuizAnswers } = useHistory()
  const ownVoices = useHistoryVoices('own', section === 'own')
  const supportedVoices = useHistoryVoices('supported', section === 'supported')

  const handleReturnToLine = () => {
    try {
      if (closeLineWindow()) return
    } catch {
      // Use the LIFF URL as a fallback when the client cannot close the app.
    }
    window.location.assign(liffUrl('/') ?? '/')
  }

  return (
    <HistoryView
      status={status}
      errorMessage={error?.message ?? null}
      section={section}
      showEmpty={data ? isBlankHistory(data) : false}
      feedPath={FEED_PATH}
      onSelectSection={setSection}
      onRetry={() => void refresh()}
      onReturnToLine={handleReturnToLine}
    >
      {data ? (
        section === 'trace' ? (
          <HistoryTracePanel
            model={data}
            quizError={error?.message ?? null}
            isLoadingMoreQuizzes={isLoadingMore}
            onLoadMoreQuizzes={() => void loadMoreQuizAnswers()}
            feedPath={FEED_PATH}
            quizPath={QUIZ_PATH}
          />
        ) : section === 'own' ? (
          <HistoryVoicePanel source="own" total={data.contributions.concernCount} {...ownVoices} />
        ) : (
          <HistoryVoicePanel
            source="supported"
            total={data.contributions.givenReactionCount}
            {...supportedVoices}
          />
        )
      ) : null}
    </HistoryView>
  )
}
