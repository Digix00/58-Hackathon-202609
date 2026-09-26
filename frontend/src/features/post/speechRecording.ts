// APIの60秒制限に、エンコーダーの末尾フレーム分の余裕を持たせる。
export const RECORDING_LIMIT_SECONDS = 59
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024

export type SpeechRecording = { stop: () => void; audio: Promise<File> }

export function supportedRecordingType(): string | undefined {
  if (!globalThis.navigator?.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) return
  return ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  )
}

/** 権限待ち・録音・停止後の最終チャンクを扱い、終了時には必ずマイクを解放する。 */
export async function startSpeechRecording(
  signal: AbortSignal,
  onSeconds: (seconds: number) => void,
): Promise<SpeechRecording> {
  const mimeType = supportedRecordingType()
  if (!mimeType) throw new DOMException('Unsupported recording', 'NotSupportedError')
  signal.throwIfAborted()
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const releaseStream = () => stream.getTracks().forEach((track) => track.stop())
  // 権限ダイアログを閉じられない環境でも、後から許可されたマイクを残さない。
  if (signal.aborted) {
    releaseStream()
    signal.throwIfAborted()
  }

  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 })
  } catch (error) {
    releaseStream()
    throw error
  }

  let stop = () => {}
  const audio = new Promise<File>((resolve, reject) => {
    let chunks: Blob[] = []
    let bytes = 0
    let settled = false
    let stopped = false
    let timer: ReturnType<typeof setInterval> | undefined
    let stopTimer: ReturnType<typeof setTimeout> | undefined
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    const tracks = stream.getTracks()
    const cleanup = () => {
      clearInterval(timer)
      clearTimeout(stopTimer)
      clearTimeout(flushTimer)
      signal.removeEventListener('abort', abort)
      tracks.forEach((track) => track.removeEventListener('ended', interrupted))
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.onerror = null
      if (recorder.state !== 'inactive') recorder.stop()
      releaseStream()
      chunks = []
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const abort = () => fail(signal.reason)
    const interrupted = () => fail(new DOMException('Recording interrupted', 'NotReadableError'))
    stop = () => {
      if (settled || stopped) return
      stopped = true
      clearInterval(timer)
      clearTimeout(stopTimer)
      try {
        recorder.stop()
        releaseStream()
        // stopイベントが来ない環境でも待ち続けない。
        flushTimer = setTimeout(interrupted, 5_000)
      } catch (error) {
        fail(error)
      }
    }
    recorder.ondataavailable = (event) => {
      bytes += event.data.size
      if (bytes > MAX_AUDIO_BYTES) {
        fail(new DOMException('Audio too large', 'QuotaExceededError'))
      } else if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }
    recorder.onerror = interrupted
    recorder.onstop = () => {
      if (settled) return
      if (bytes === 0) {
        fail(new DOMException('Empty audio', 'NotReadableError'))
        return
      }
      const type = recorder.mimeType.split(';')[0]
      const file = new File(chunks, type === 'audio/mp4' ? 'voice.m4a' : 'voice.webm', { type })
      settled = true
      cleanup()
      resolve(file)
    }
    signal.addEventListener('abort', abort, { once: true })
    tracks.forEach((track) => track.addEventListener('ended', interrupted, { once: true }))
    try {
      recorder.start(1_000)
      const startedAt = performance.now()
      timer = setInterval(() => {
        const seconds = Math.floor((performance.now() - startedAt) / 1_000)
        onSeconds(Math.min(seconds, RECORDING_LIMIT_SECONDS))
        if (seconds >= RECORDING_LIMIT_SECONDS) stop()
      }, 250)
      stopTimer = setTimeout(stop, RECORDING_LIMIT_SECONDS * 1_000)
    } catch (error) {
      fail(error)
    }
  })
  return { stop: () => stop(), audio }
}
