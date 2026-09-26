import { useCallback } from 'react'
import type { QuizAnswerResponse } from '../../lib/api'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { prefersReducedMotion } from '../../shared/hooks/useNotebookSwipe'
import { useQuizData } from './quizContext'
import { useQuizNotebook } from './useQuizNotebook'
import { useQuizAnswers } from './useQuizAnswers'
import { useQuizSubmit } from './useQuizSubmit'
import { useQuizAnimation } from './useQuizAnimation'

/**
 * Intent: 回答編集・送信・紙送りを、読書中の操作として合成する。
 * Boundary: 確定結果の反映先を受け取り、紙面の表示値と意味のある操作を返す。
 * State Modeling: 回答・送信・ページ・アニメーションの状態はそれぞれのHookが所有する。
 * Update Surface: go / openCover / reopen / openTab / fit / pull / submit / finishTurn。
 * Hidden Complexity: 配置後の紙送りと取消し、送信成功後の結果表示の順序だけを調整する。
 * Composition: useQuizAnswers / useQuizSubmit / useQuizNotebook / useQuizAnimationを接続する。
 * Test Notes: 配置・取り外し・前後移動、送信失敗での選択保持、成功後の先頭表示を確認する。
 */
export function useQuizNavigation(setAnswerResult: (result: QuizAnswerResponse) => void) {
  const { language } = useDisplaySettings()
  const { id: quizId, people, letters: quizLetters, answerResult: quizResult } = useQuizData()
  const notebook = useQuizNotebook(quizLetters.length, Boolean(quizResult))
  const { actions } = notebook
  const submission = useQuizSubmit(quizId, language)
  const editing =
    !quizResult &&
    submission.status !== 'submitting' &&
    submission.status !== 'succeeded' &&
    submission.status !== 'unavailable'
  const selection = useQuizAnswers(people, quizLetters, quizResult, editing)
  const { answers, remaining, complete, place, remove } = selection
  const letters = quizLetters
  const letter = letters[notebook.index]
  const showingResults = Boolean(quizResult) || submission.status === 'succeeded'
  /** 表紙を開きはじめたか。ここから先、ふもとに表紙を開く操作は置かない。 */
  const coverOpening = notebook.coverLifting || notebook.coverOpened
  const onCoverLifted = useCallback(() => actions.openCover(), [actions])
  const animation = useQuizAnimation(coverOpening, notebook.coverLifting, onCoverLifted)
  const {
    turning,
    stackRef,
    rememberStackPosition,
    beginTurn,
    clearTurning,
    cancelSettle,
    scheduleSettle,
  } = animation
  const canGoNext = notebook.coverOpened && notebook.index < letters.length - 1 && !turning
  const canGoPrev = notebook.coverOpened && notebook.index > 0 && !turning

  /**
   * 表紙を開く。
   *
   * ボタンから開くときは、まず紙束を押し上げる。表紙を開く操作が消えたぶん、
   * 紙束の置き場所が変わるためで、めくるのはそれが落ち着いてから。
   * 指がもう紙を起こしはじめているなら、その続きとしてそのままめくる。
   * 待たせると、せっかく起こした角度が寝てしまう。
   */
  const openCover = useCallback(
    (startAngle = 0) => {
      if (notebook.coverOpened) return
      if (prefersReducedMotion()) {
        actions.openCover()
        return
      }
      if (startAngle !== 0) {
        if (!notebook.coverLifting) rememberStackPosition()
        beginTurn({ kind: 'cover', startAngle, direction: 1 })
        actions.openCover()
        return
      }
      if (notebook.coverLifting) return
      rememberStackPosition()
      actions.liftCover()
    },
    [beginTurn, actions, rememberStackPosition, notebook.coverLifting, notebook.coverOpened],
  )

  /**
   * 閉じたノートを、その付箋の手紙で開き直す。
   *
   * 出す前ならいつでも挟み替えられるので、確かめるのも選び直すのも、
   * 付箋を押すというひとつの操作から始める。
   */
  const reopen = useCallback(
    (index: number, startAngle = 0) => {
      if (!notebook.closed || turning) return
      if (prefersReducedMotion()) {
        actions.reopen(index)
        return
      }
      beginTurn({ kind: 'cover', startAngle, direction: 1 })
      actions.reopen(index)
    },
    [beginTurn, actions, notebook.closed, turning],
  )

  /**
   * 付箋から、その手紙へ移る。
   *
   * 閉じていればノートごと開き、開いていればその紙まで一度でめくる。
   * 何通目かは付箋の持ち場そのものなので、押した先がどこかは迷わない。
   */
  const openTab = useCallback(
    (index: number) => {
      cancelSettle()
      if (turning) return
      if (!notebook.coverOpened) {
        reopen(index)
        return
      }
      if (index === notebook.index) return
      if (prefersReducedMotion()) {
        actions.openLetter(index)
        return
      }
      if (index > notebook.index) {
        // 先の手紙へ。いま読んでいる紙をめくって去らせる。
        beginTurn({
          kind: 'letter',
          letter,
          personId: answers[letter.id],
          startAngle: 0,
          direction: 1,
        })
        actions.openLetter(index)
        return
      }
      // 前の手紙へ。伏せていた紙を拾い上げ、降ろし終えてから入れ替える。
      const target = letters[index]
      beginTurn({
        kind: 'letter',
        letter: target,
        personId: answers[target.id],
        startAngle: 0,
        direction: -1,
        toIndex: index,
      })
    },
    [
      answers,
      beginTurn,
      cancelSettle,
      actions,
      letter,
      letters,
      reopen,
      notebook.coverOpened,
      notebook.index,
      turning,
    ],
  )

  const go = useCallback(
    (direction: 1 | -1, startAngle = 0) => {
      cancelSettle()
      if (turning) return
      // 表紙が残っているうちは、めくる相手は手紙ではなく表紙。
      if (!notebook.coverOpened) {
        if (direction !== 1) return
        // 閉じたノートは、最後に見ていた手紙から開く。
        if (notebook.closed) reopen(notebook.index, startAngle)
        else openCover(startAngle)
        return
      }
      const index = notebook.index + direction
      if (index < 0 || index >= letters.length) return
      if (prefersReducedMotion()) {
        clearTurning()
        actions.go(direction)
        return
      }

      if (direction === 1) {
        // 進むときは、いま見ている紙をめくって下の紙を出す。
        beginTurn({
          kind: 'letter',
          letter,
          personId: answers[letter.id],
          startAngle,
          direction: 1,
        })
        actions.go(direction)
      } else {
        // 戻るときは、伏せていた前の紙を同じ共有アニメーションで拾い上げる。
        const previous = letters[index]
        beginTurn({
          kind: 'letter',
          letter: previous,
          personId: answers[previous.id],
          startAngle: 0,
          direction: -1,
        })
      }
    },
    [
      answers,
      beginTurn,
      cancelSettle,
      clearTurning,
      actions,
      letter,
      letters,
      openCover,
      reopen,
      notebook.closed,
      notebook.coverOpened,
      notebook.index,
      turning,
    ],
  )

  function fit(personId: string) {
    if (!notebook.coverOpened || turning) return
    const open = place(letter.id, personId)
    if (open === null) return
    const placed = letter
    if (open === notebook.index) return

    cancelSettle()
    /*
     * すぐにはめくらない。挟まったしおりを一拍だけ見せる。
     * その間に「ちがった」と気づいたら、しおりを押せば手元へ戻り、
     * 紙もその場に留まる（cancelSettle）。
     */
    scheduleSettle(() => {
      if (open === -1) {
        /*
         * 空いている手紙はもうない。読み終えたノートとして閉じる。
         * 閉じた表紙には挟んだ付箋だけが出るので、見直す先はそこから選ぶ。
         */
        if (prefersReducedMotion()) actions.close()
        else beginTurn({ kind: 'cover', startAngle: 0, direction: -1 })
        return
      }
      if (!prefersReducedMotion()) {
        beginTurn({ kind: 'letter', letter: placed, personId, startAngle: 0, direction: 1 })
      }
      actions.openLetter(open)
    })
  }

  const submit = async () => {
    if (!complete || !editing) return
    cancelSettle()
    const result = await submission.submit(selection.matches)
    if (!result) return
    setAnswerResult(result)
    if (notebook.closed && !prefersReducedMotion()) {
      beginTurn({ kind: 'cover', startAngle: 0, direction: 1 })
    }
    actions.showResults()
  }

  const finishTurn = useCallback(() => {
    if (turning?.kind === 'letter' && turning.direction === -1) {
      // 付箋から跳んだときは行き先が決まっている。前後の移動は1通ずつ戻る。
      if (turning.toIndex === undefined) {
        actions.go(-1)
      } else actions.openLetter(turning.toIndex)
    }
    // 表紙が戻りきってから閉じる。先に閉じると、めくる表紙が二重に見える。
    if (turning?.kind === 'cover' && turning.direction === -1) {
      actions.close()
    }
    clearTurning()
  }, [clearTurning, actions, turning])

  const pull = useCallback(
    (letterId: string) => {
      // 抜いたなら、めくるのはやめる。選び直す紙が目の前から消えてしまう。
      if (!editing) return
      cancelSettle()
      remove(letterId)
    },
    [cancelSettle, editing, remove],
  )

  return {
    index: notebook.index,
    coverOpened: notebook.coverOpened,
    coverLifting: notebook.coverLifting,
    closed: notebook.closed,
    letter,
    answers,
    remaining,
    complete,
    showingResults,
    canGoNext,
    canGoPrev,
    coverOpening,
    stackRef,
    turning,
    go,
    openCover,
    reopen,
    openTab,
    fit,
    submit,
    submitting: submission.status === 'submitting',
    submitError: submission.error,
    unavailable: submission.status === 'unavailable',
    finishTurn,
    pull,
  }
}
