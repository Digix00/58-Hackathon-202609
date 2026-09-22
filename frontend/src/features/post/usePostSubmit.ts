import { useCallback, useState } from 'react'

import { createConcern } from './postApi'
import type { PostFormFieldErrors, PostFormInput, PostResult } from './postTypes'
import { validatePostInput } from './postTypes'

export type PostSubmitStatus = 'idle' | 'submitting' | 'succeeded' | 'failed'

export interface UsePostSubmitResult {
  status: PostSubmitStatus
  fieldErrors: PostFormFieldErrors
  error: string | null
  result: PostResult | null
  submit: (input: PostFormInput) => Promise<void>
  reset: () => void
}

/** 投稿フォームの送信処理・バリデーション・送信中/エラー状態を提供するフック。UIはContainer(#60)が持つ。 */
export function usePostSubmit(): UsePostSubmitResult {
  const [status, setStatus] = useState<PostSubmitStatus>('idle')
  const [fieldErrors, setFieldErrors] = useState<PostFormFieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PostResult | null>(null)

  const submit = useCallback(async (input: PostFormInput): Promise<void> => {
    const validationErrors = validatePostInput(input)
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      return
    }

    setFieldErrors({})
    setError(null)
    setStatus('submitting')

    const response = await createConcern(input)
    if (response.ok) {
      setStatus('succeeded')
      setResult(response.concern)
      return
    }

    setStatus('failed')
    setError(response.message)
  }, [])

  const reset = useCallback((): void => {
    setStatus('idle')
    setFieldErrors({})
    setError(null)
    setResult(null)
  }, [])

  return { status, fieldErrors, error, result, submit, reset }
}
