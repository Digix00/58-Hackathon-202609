import { useTranslation } from '../../i18n/useTranslation'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { Link } from 'react-router'
import { ComingSoonLabel } from '../../shared/components/ComingSoonLabel'
import { NotebookBinding } from '../../shared/components/NotebookBinding'
import { NotebookTurn } from '../../shared/components/NotebookTurn'
import { NotebookStack } from '../../shared/components/NotebookStack'
import { prefersReducedMotion } from '../../shared/hooks/useNotebookSwipe'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { POST_BODY_MAX_LENGTH } from './postTypes'
import { usePostDraft } from './usePostDraft'
import { usePostSubmit } from './usePostSubmit'
import styles from './PostPage.module.css'

/**
 * 投稿画面は、フィードと同じ一冊のリングノートである。
 * 読む画面が「誰かの紙をめくる」なら、この画面は「同じノートに自分の紙を書き足す」。
 * だから紙・とじリング・上辺のしおり・めくりはフィードの作りをそのまま使い、
 * 本文の面だけを読むための面から書くための面へ差し替える。
 */

/** まだ誰も読んでいない一枚。フィードのページ色は当てず、生成りのまま置く。 */
const PAPER_TINT = '#fffdf4'
const paperStyle = { '--paper-tint': PAPER_TINT } as CSSProperties

/** 紙の上辺に挟むしおり。投稿はこの2枚で終わることを、めくる前に見せておく。 */
const STEPS = [
  { id: 'write', label: 'post.write' },
  { id: 'confirm', label: 'post.review' },
] as const
type Step = (typeof STEPS)[number]['id']

/** 例文。書き出しに迷ったときの手がかりなので、置く場所は書く面の中にする。 */
const BODY_EXAMPLE = 'post.example'

/**
 * いまめくられている最中の1枚。
 *
 * 進むとき（1）は、書いた紙が左へ伏せ、その下から次の紙が現れる。
 * 戻るとき（-1）は、伏せてあった紙を拾い上げ、書きかけの紙として降ろす。
 * どちらも紙に載っている言葉は同じなので、めくる紙は読む面で描く。
 */
type TurningPage = { step: Step; direction: 1 | -1; key: number }

/**
 * 手で描いたマイク。
 * 記号や既製のアイコンを置くと、この画面の中でここだけ定規で引いた線に見える。
 */
function CrayonMic() {
  return (
    <svg className={styles.mic} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.3c1.8-.1 3.1 1.2 3.2 2.9v4.4c.1 1.8-1.3 3.2-3.1 3.2-1.8 0-3.2-1.3-3.2-3.1V6.4c0-1.7 1.3-3 3.1-3.1Z" />
      <path d="M6.5 11.3c.2 2.9 2.6 5.3 5.6 5.3 3 0 5.4-2.3 5.5-5.2" />
      <path d="M12 16.8c.1 1.2.1 2.3 0 3.4" />
      <path d="M9.3 20.4c1.9-.2 3.7-.2 5.5 0" />
    </svg>
  )
}

/**
 * 置いていった紙に添える星。
 * 意味を持たせず、押せる要素にもしない。1画面に置く落書きはこれ一つだけ。
 */
function CrayonStar() {
  return (
    <svg className={styles.star} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M20 3.6l5.2 10.5 11.5 1.5-8.2 8.2 2 11.4L20 29.8 9.4 35.2l2.1-11.5-8.2-8.1 11.6-1.6Z" />
    </svg>
  )
}

function StepTabs({ current }: { current: Step }) {
  const { t } = useTranslation()

  return (
    <ol className={styles.tabs} aria-label={t('post.steps')}>
      {STEPS.map((step) => (
        <li
          key={step.id}
          className={`${styles.tab} ${step.id === current ? styles.tabCurrent : ''}`}
          aria-current={step.id === current ? 'step' : undefined}
        >
          {t(step.label)}
          {/* いまの手順は紙から高く出して示す。読み上げには言葉で添える。 */}
          {step.id === current ? (
            <span className={styles.srOnly}>{t('post.currentStep')}</span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

/**
 * 書いたぶんだけ紙を伸ばす。
 *
 * 入力欄の中だけを送ると、紙に引いた罫線は動かないので、文字が線からずれていく。
 * 紙が伸びれば線も一緒に増えるので、いつでも文字が線の上に乗る。
 * 高さは行送りの倍数へそろえる。端数で止めると最後の行だけ線から浮く。
 */
const SUPPORTS_FIELD_SIZING = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

/**
 * Intent: 本文編集に追従する紙の高さ計測を局所化する。
 * Boundary: textareaのrefと本文だけを受け取り、値や更新操作を公開しない。
 * State Modeling: 前回本文は計測判断にだけ必要なのでrefで保持する。
 * Update Surface: なし。本文変更後にDOMの高さを調整する。
 * Hidden Complexity: field-sizingの対応判定、削除時の縮小、行送りへの丸め。
 * Composition: 入力Viewが本文を渡し、表示の高さだけを調整する。
 * Test Notes: 追記・削除・置換・CSS対応環境での計測省略を確認する。
 */
function useGrowingSheet(ref: RefObject<HTMLTextAreaElement | null>, body: string) {
  const previousBody = useRef(body)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node || SUPPORTS_FIELD_SIZING) return

    // 追記中は現在の高さを保ち、行があふれたときだけ伸ばす。
    // 削除や置き換えでは一度自然な高さへ戻し、紙も縮められるようにする。
    if (!body.startsWith(previousBody.current)) node.style.height = ''
    previousBody.current = body

    const contentHeight = node.scrollHeight
    const currentHeight = node.clientHeight
    if (contentHeight <= currentHeight) return

    const line = Number.parseFloat(window.getComputedStyle(node).lineHeight)
    const nextHeight = Number.isFinite(line)
      ? Math.ceil(contentHeight / line) * line
      : contentHeight
    if (nextHeight > currentHeight) node.style.height = `${nextHeight}px`
  }, [body, ref])
}

/** 書く紙。呼びかけ、罫線を敷いた書く面、ふもとの3段で組む。 */
function WriteSheet({
  body,
  fieldError,
  inputRef,
  onBodyChange,
}: {
  body: string
  fieldError?: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  onBodyChange: (body: string) => void
}) {
  const { t } = useTranslation()

  return (
    <article
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${styles.writeCard}`}
      style={paperStyle}
    >
      {/* とじ穴。リングと違い、これは紙の側にあるのでページと一緒に動く。 */}
      <NotebookBinding part="holes" />
      <StepTabs current="write" />
      <div className={styles.prompt}>
        {/* 紙の上の呼びかけが、そのまま入力欄のラベルを兼ねる。 */}
        <label className={styles.promptTitle} htmlFor="post-body">
          {t('post.prompt')}
        </label>
        <p className={styles.promptLead}>{t('post.promptHint')}</p>
      </div>
      <WriteFields
        initialBody={body}
        fieldError={fieldError}
        inputRef={inputRef}
        onBodyChange={onBodyChange}
      />
    </article>
  )
}

/** 本文入力の再描画と高さ計測を、紙全体から切り離す。 */
function WriteFields({
  initialBody,
  fieldError,
  inputRef,
  onBodyChange,
}: {
  initialBody: string
  fieldError?: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  onBodyChange: (body: string) => void
}) {
  const { t, message } = useTranslation()
  const [body, setBody] = useState(initialBody)
  const tooLong = body.trim().length > POST_BODY_MAX_LENGTH

  useGrowingSheet(inputRef, body)

  return (
    <>
      <div className={styles.write}>
        <textarea
          id="post-body"
          ref={inputRef}
          className={styles.input}
          value={body}
          onChange={(event) => {
            const nextBody = event.target.value
            setBody(nextBody)
            onBodyChange(nextBody)
          }}
          placeholder={t(BODY_EXAMPLE)}
          maxLength={POST_BODY_MAX_LENGTH + 1}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={`${fieldError ? 'post-body-error ' : ''}post-body-count`}
        />
      </div>
      {fieldError ? (
        <p id="post-body-error" className={styles.error} role="alert">
          {message(fieldError, { max: POST_BODY_MAX_LENGTH })}
        </p>
      ) : null}
      <div className={styles.cardFoot}>
        {/* TODO: 音声入力と文字起こしを接続し、投稿前に結果を確認・修正できるようにする。 */}
        <button
          type="button"
          className={styles.voiceButton}
          disabled
          aria-describedby="post-voice-note"
        >
          <CrayonMic />
          {t('post.voice')}
          <ComingSoonLabel
            id="post-voice-note"
            className={styles.voiceLabel}
            ariaLabel={t('post.voiceSoon')}
          />
        </button>
        <p id="post-body-count" className={`${styles.count} ${tooLong ? styles.countOver : ''}`}>
          {t('post.characterCount', { count: body.length, max: POST_BODY_MAX_LENGTH })}
          {tooLong ? <span className={styles.srOnly}>{t('post.overLimit')}</span> : null}
        </p>
      </div>
    </>
  )
}

/** 読み返す紙。書いた言葉だけを、書いていたときと同じ行の上に残す。 */
function ReadSheet({ body, step }: { body: string; step: Step }) {
  return (
    <article
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${styles.readCard}`}
      style={paperStyle}
    >
      <NotebookBinding part="holes" />
      <StepTabs current={step} />
      <div className={styles.write}>
        <p className={styles.readBody}>{body.trim()}</p>
      </div>
    </article>
  )
}

/** 置いていった紙。お礼と、これから進むことだけを載せる。 */
function DoneSheet({ note }: { note: string }) {
  const { t } = useTranslation()

  return (
    <article
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${styles.doneCard}`}
      style={paperStyle}
    >
      <NotebookBinding part="holes" />
      <div className={styles.doneInner} aria-live="polite">
        <CrayonStar />
        <p className={styles.doneTitle}>
          {t('post.thanksLead')}
          <br />
          {t('post.thanks')}
        </p>
        <p className={styles.doneLead}>{note}</p>
      </div>
    </article>
  )
}

/**
 * 紙束。書き足す先が一冊のノートであることを、下に控えた紙のふちで伝える。
 * めくり終えた紙は捨てず、最終フレームの姿勢のままリング左側に残す。
 */
function PostStack({
  body,
  view,
  turning,
  fieldError,
  doneNote,
  inputRef,
  onBodyChange,
  onTurningFinished,
}: {
  body: string
  view: Step | 'done'
  turning: TurningPage | null
  fieldError?: string
  doneNote: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  onBodyChange: (body: string) => void
  onTurningFinished: () => void
}) {
  return (
    <NotebookStack
      className={styles.stack}
      opened={view === 'done'}
      turning={
        turning ? (
          <NotebookTurn
            key={turning.key}
            startAngle={0}
            direction={turning.direction}
            onFinish={onTurningFinished}
          >
            <ReadSheet body={body} step={turning.step} />
          </NotebookTurn>
        ) : null
      }
    >
      <div className={styles.enter}>
        {view === 'write' ? (
          <WriteSheet
            body={body}
            fieldError={fieldError}
            inputRef={inputRef}
            onBodyChange={onBodyChange}
          />
        ) : view === 'confirm' ? (
          <ReadSheet body={body} step="confirm" />
        ) : (
          <DoneSheet note={doneNote} />
        )}
      </div>
    </NotebookStack>
  )
}

function PostActions({
  view,
  error,
  submitting,
  onConfirm,
  onEdit,
  onSubmit,
}: {
  view: Step | 'done'
  error: string | null
  submitting: boolean
  onConfirm: () => void
  onEdit: () => void
  onSubmit: () => void
}) {
  const { t, message } = useTranslation()

  if (view === 'write') {
    return (
      <div className={styles.actions}>
        <button
          type="button"
          className={`${actionStyles.primary} ${styles.nextButton}`}
          onClick={onConfirm}
        >
          {t('post.reviewAction')}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    )
  }

  if (view === 'confirm') {
    return (
      <div className={styles.actions}>
        {/* 匿名と安全の注意は、投稿を決める前に、省略せずここで読ませる。 */}
        <p className={styles.caution}>{t('post.privacy')}</p>
        {error ? (
          <p className={styles.submitError} role="alert">
            {message(error)}
          </p>
        ) : null}
        <button
          type="button"
          className={`${actionStyles.primary} ${styles.nextButton}`}
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? t('post.submitting') : error ? t('post.retry') : t('post.submit')}
        </button>
        <button type="button" className={actionStyles.text} onClick={onEdit} disabled={submitting}>
          {t('post.edit')}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.actions}>
      <Link className={`${actionStyles.primary} ${styles.nextButton}`} to="/">
        {t('post.readOthers')}
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  )
}

export function PostPage() {
  const { t } = useTranslation()

  const draft = usePostDraft()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const submission = usePostSubmit()
  /** めくり直すたびにアニメーションを最初から流すため、鍵を増やしながら持つ。 */
  const [turning, setTurning] = useState<TurningPage | null>(null)
  const submitted = submission.status === 'succeeded'
  const view: Step | 'done' = submitted ? 'done' : draft.step

  useEffect(() => {
    if (submission.fieldErrors.body) inputRef.current?.focus()
  }, [submission.fieldErrors.body])

  const turn = (step: Step, direction: 1 | -1) => {
    if (prefersReducedMotion()) return
    setTurning((current) => ({ step, direction, key: (current?.key ?? 0) + 1 }))
  }

  return (
    <div className={styles.page}>
      <section className={styles.stage} aria-labelledby="post-title">
        <h1 id="post-title" className={styles.srOnly}>
          {t('post.title')}
        </h1>
        <PostStack
          body={draft.body}
          view={view}
          turning={turning}
          fieldError={submission.fieldErrors.body}
          doneNote={t('post.done')}
          inputRef={inputRef}
          onBodyChange={(value) => {
            draft.changeBody(value)
            if (submission.fieldErrors.body || submission.error) submission.reset()
          }}
          onTurningFinished={() => setTurning(null)}
        />
      </section>
      <PostActions
        view={view}
        error={submission.error}
        submitting={submission.status === 'submitting'}
        onConfirm={() => {
          // 進めない本文のときは、送信の検証にエラーの文言を出させる。
          if (!draft.confirm()) {
            void submission.submit({ body: draft.getBody() })
            return
          }
          turn('write', 1)
        }}
        onEdit={() => {
          draft.edit()
          turn('write', -1)
        }}
        onSubmit={() => {
          // 送信できたら、書いた紙をノートへめくり込む。その下からお礼の紙が現れる。
          void submission.submit({ body: draft.getBody() }).then((saved) => {
            if (saved) turn('confirm', 1)
          })
        }}
      />
    </div>
  )
}
