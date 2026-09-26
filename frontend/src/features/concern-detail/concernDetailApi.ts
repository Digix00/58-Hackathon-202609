import { apiErrorMessage } from '../../i18n/translate'
import { ApiTimeoutError, apiClient, readApiError, withApiTimeout } from '../../lib/api'
import type { ConcernDetailResponse } from '../../lib/api'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'

export type GetConcernDetailResult =
  | { ok: true; data: ConcernDetailResponse }
  | { ok: false; status: number; code: string; message: string }

export async function getConcernDetail(
  id: string,
  language: DisplayLanguage = 'original',
): Promise<GetConcernDetailResult> {
  try {
    // Handlerはqueryを手動検証するため、RPCの推論にはparamだけが含まれる。
    const request = { param: { concernId: id }, query: { language } }
    const response = await withApiTimeout(() =>
      apiClient.api.v1.concerns[':concernId'].$get(request),
    )

    if (response.ok) return { ok: true, data: await response.json() }

    const error = await readApiError(response)
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: apiErrorMessage(error?.code, 'error.loadConcern'),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: error instanceof ApiTimeoutError ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message: error instanceof ApiTimeoutError ? 'error.timeout' : 'error.loadConcern',
    }
  }
}
