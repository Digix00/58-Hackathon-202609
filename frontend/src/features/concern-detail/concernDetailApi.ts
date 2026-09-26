import { ApiTimeoutError, apiClient, readApiError, withApiTimeout } from '../../lib/api'
import type { ConcernDetailResponse } from '../../lib/api'

export type GetConcernDetailResult =
  | { ok: true; data: ConcernDetailResponse }
  | { ok: false; status: number; code: string; message: string }

export async function getConcernDetail(id: string): Promise<GetConcernDetailResult> {
  try {
    const response = await withApiTimeout(() =>
      apiClient.api.v1.concerns[':concernId'].$get({ param: { concernId: id } }),
    )

    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: error?.message ?? '投稿を読み込めませんでした。時間をおいて再試行してください',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message:
        error instanceof ApiTimeoutError
          ? '読み込みに時間がかかっています。時間をおいて再試行してください'
          : '投稿を読み込めませんでした。時間をおいて再試行してください',
    }
  }
}
