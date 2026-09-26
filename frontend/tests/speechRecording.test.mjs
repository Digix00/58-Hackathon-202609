import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_AUDIO_BYTES,
  RECORDING_LIMIT_SECONDS,
  startSpeechRecording,
  supportedRecordingType,
} from '../src/features/post/speechRecording.ts'

function setup(context, { type = 'audio/webm;codecs=opus', permission } = {}) {
  const track = new EventTarget()
  track.stop = context.mock.fn()
  const stream = { getTracks: () => [track] }
  let recorder
  class FakeRecorder {
    static isTypeSupported(candidate) {
      return candidate === type
    }
    state = 'inactive'
    constructor(_stream, options) {
      this.mimeType = options.mimeType
      recorder = this
    }
    start() {
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      // 実ブラウザと同じく、停止要求より後に最終チャンクが届く。
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(['final']) })
        this.onstop?.()
      })
    }
  }
  const originals = ['navigator', 'MediaRecorder'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ])
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: permission ?? (async () => stream) } },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder })
  context.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  return {
    track,
    stream,
    get recorder() {
      return recorder
    },
  }
}

test('停止後の最終チャンクを含め、APIで受け付けるFileを返してマイクを解放する', async (t) => {
  const fake = setup(t)
  const session = await startSpeechRecording(new AbortController().signal, () => {})
  fake.recorder.ondataavailable({ data: new Blob(['first']) })
  session.stop()
  session.stop()
  const audio = await session.audio
  assert.equal(await audio.text(), 'firstfinal')
  assert.equal(audio.type, 'audio/webm')
  assert.equal(audio.name, 'voice.webm')
  assert.ok(fake.track.stop.mock.callCount() > 0)
})

test('WebM非対応ならAAC MP4を選ぶ', async (t) => {
  setup(t, { type: 'audio/mp4;codecs=mp4a.40.2' })
  const session = await startSpeechRecording(new AbortController().signal, () => {})
  session.stop()
  const audio = await session.audio
  assert.equal(audio.type, 'audio/mp4')
  assert.equal(audio.name, 'voice.m4a')
})

test('対応する録音形式がない環境で権限要求を行わない', async (t) => {
  const permission = t.mock.fn()
  setup(t, { type: 'audio/ogg', permission })
  assert.equal(supportedRecordingType(), undefined)
  await assert.rejects(
    startSpeechRecording(new AbortController().signal, () => {}),
    { name: 'NotSupportedError' },
  )
  assert.equal(permission.mock.callCount(), 0)
})

test('キャンセル後にマイク権限が許可されても録音せず解放する', async (t) => {
  let allow
  const fake = setup(t, {
    permission: () =>
      new Promise((resolve) => {
        allow = resolve
      }),
  })
  const controller = new AbortController()
  const pending = startSpeechRecording(controller.signal, () => {})
  controller.abort()
  allow(fake.stream)
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(fake.recorder, undefined)
  assert.equal(fake.track.stop.mock.callCount(), 1)
})

test('録音中のキャンセルで結果を破棄し、マイクを解放する', async (t) => {
  const fake = setup(t)
  const controller = new AbortController()
  const session = await startSpeechRecording(controller.signal, () => {})
  controller.abort()
  await assert.rejects(session.audio, { name: 'AbortError' })
  assert.equal(fake.recorder.state, 'inactive')
  assert.ok(fake.track.stop.mock.callCount() > 0)
})

test('10 MiBを超えた録音は送信用Fileにせず停止する', async (t) => {
  const fake = setup(t)
  const session = await startSpeechRecording(new AbortController().signal, () => {})
  fake.recorder.ondataavailable({ data: new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)]) })
  await assert.rejects(session.audio, { name: 'QuotaExceededError' })
  assert.equal(fake.recorder.state, 'inactive')
  assert.ok(fake.track.stop.mock.callCount() > 0)
})

test('59秒で自動停止し、結果を返す', async (t) => {
  const fake = setup(t)
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const session = await startSpeechRecording(new AbortController().signal, () => {})
  t.mock.timers.tick(RECORDING_LIMIT_SECONDS * 1_000)
  const audio = await session.audio
  assert.equal(await audio.text(), 'final')
  assert.equal(fake.recorder.state, 'inactive')
})

test('録音デバイスの切断は失敗とし、途中音声を送信しない', async (t) => {
  const fake = setup(t)
  const session = await startSpeechRecording(new AbortController().signal, () => {})
  fake.track.dispatchEvent(new Event('ended'))
  await assert.rejects(session.audio, { name: 'NotReadableError' })
  assert.ok(fake.track.stop.mock.callCount() > 0)
})
