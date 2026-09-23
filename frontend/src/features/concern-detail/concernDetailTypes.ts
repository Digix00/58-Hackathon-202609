import type { ConcernDetailResponse } from '../../lib/api'

export type ConcernDetail = ConcernDetailResponse

export type ConcernDetailStatus = 'idle' | 'loading' | 'success' | 'error'
