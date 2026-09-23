import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { usePostSubmit } from './usePostSubmit'
import { POST_BODY_MAX_LENGTH } from './postTypes'
import { usePostDraft } from './usePostDraft'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'

type Step = 'write' | 'confirm'

function PostView({
  body,
  step,
  error,
  fieldError,
  submitting,
  onBodyChange,
  onConfirm,
  onEdit,
  onSubmit,
  inputRef,
}: {
  body: string
  step: Step
  error: string | null
  fieldError?: string
  submitting: boolean
  onBodyChange: (body: string) => void
  onConfirm: () => void
  onEdit: () => void
  onSubmit: () => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className={screen.page}>
      <header className={screen.heading}>
        <p className={screen.eyebrow}>投稿</p>
        <h1>
          {step === 'write' ? (
            <>
              ここに、
              <br />
              そっと書いてね。
            </>
          ) : (
            '投稿内容を確認する'
          )}
        </h1>
        <p className={screen.muted}>うまくまとまっていなくても大丈夫です。</p>
      </header>
      {step === 'write' ? (
        <div className={screen.page}>
          <div
            className={`${screen.paper} ${screen.taped} ${screen.tapeRight} ${crayonStyles.edge}`}
          >
            <label className={screen.field} htmlFor="post-body">
              悩みの内容
            </label>
            <textarea
              id="post-body"
              ref={inputRef}
              className={screen.textarea}
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
              placeholder="うまくまとまっていなくても大丈夫。"
              maxLength={POST_BODY_MAX_LENGTH + 1}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'post-body-error' : 'post-body-count'}
            />
            <p id="post-body-count" className={screen.muted}>
              {body.length} / {POST_BODY_MAX_LENGTH}文字
            </p>
          </div>
          {fieldError ? (
            <p id="post-body-error" className={screen.error} role="alert">
              {fieldError}
            </p>
          ) : null}
          <p className={screen.notice}>「話して書く」は準備中です。今は文章で入力してください。</p>
          <button
            type="button"
            className={`${actionStyles.primary} ${screen.fullButton}`}
            onClick={onConfirm}
          >
            投稿内容を確認する
          </button>
        </div>
      ) : (
        <div className={screen.page}>
          <article
            className={`${screen.paper} ${screen.taped} ${screen.tapeRight} ${crayonStyles.edge}`}
          >
            <p className={screen.body}>{body.trim()}</p>
          </article>
          <p className={screen.notice}>
            投稿は匿名で公開されます。名前や連絡先など、個人が分かる情報は書かないでください。この場所は緊急相談窓口ではありません。
          </p>
          {error ? (
            <p className={screen.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={screen.actions}>
            <button
              type="button"
              className={actionStyles.secondary}
              onClick={onEdit}
              disabled={submitting}
            >
              書き直す
            </button>
            <button
              type="button"
              className={actionStyles.primary}
              onClick={onSubmit}
              disabled={submitting}
            >
              {submitting
                ? '投稿しています…'
                : error
                  ? 'もう一度投稿する'
                  : 'この内容を匿名で投稿する'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function PostPage() {
  const draft = usePostDraft()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isDemoSubmit = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_MODE === 'authenticated'
  const submission = usePostSubmit(isDemoSubmit)

  useEffect(() => {
    if (submission.fieldErrors.body) inputRef.current?.focus()
  }, [submission.fieldErrors.body])

  if (submission.status === 'succeeded') {
    return (
      <div className={screen.page} aria-live="polite">
        <header className={screen.heading}>
          <p className={screen.eyebrow}>投稿できました</p>
          <h1>置いていってくれて、ありがとう。</h1>
        </header>
        <p className={screen.muted}>
          {isDemoSubmit
            ? '開発用の画面に反映しました。再読み込みすると、この投稿は消えます。'
            : '声を保存しました。テーマなどの処理は後から反映されます。'}
        </p>
        <Link className={`${actionStyles.primary} ${screen.fullButton}`} to="/">
          声を読む
        </Link>
      </div>
    )
  }

  return (
    <PostView
      body={draft.body}
      step={draft.step}
      error={submission.error}
      fieldError={submission.fieldErrors.body}
      submitting={submission.status === 'submitting'}
      onBodyChange={(value) => {
        draft.changeBody(value)
        if (submission.fieldErrors.body || submission.error) submission.reset()
      }}
      onConfirm={() => {
        if (!draft.confirm()) void submission.submit({ body: draft.body })
      }}
      onEdit={draft.edit}
      onSubmit={() => void submission.submit({ body: draft.body })}
      inputRef={inputRef}
    />
  )
}
