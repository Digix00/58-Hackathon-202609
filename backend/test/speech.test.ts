import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "../src/app/auth-cookie";
import { createApp } from "../src/app/create-app";
import type { SpeechRateLimiter } from "../src/application/port/speech-rate-limiter";
import type { SpeechRecognizer } from "../src/application/port/speech-recognizer";
import type {
  IAuthUseCase,
  SessionView,
} from "../src/application/usecase/auth.usecase";
import { SpeechUseCase } from "../src/application/usecase/speech.usecase";
import { createApplication } from "../src/bootstrap/container";
import { VerifiedSpeechAudioDurationReader } from "../src/infrastructure/ai/speech-audio-duration.reader";
import { AuthHandler } from "../src/presentation/auth.handler";
import { HealthHandler } from "../src/presentation/health.handler";
import { SpeechHandler } from "../src/presentation/speech.handler";
import { createWavAudio, createWebmAudio } from "./support/audio-fixture";
import { createConcernDependencies } from "./support/concern-fixture";
import { createUserDependencies } from "./support/user-fixture";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const authenticatedSession: SessionView = {
  session: {
    id: "speech-test-session",
    userId: "speech-test-user",
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
  user: {
    id: "speech-test-user",
    lineUserId: "line-speech-test-user",
    birthYear: null,
    birthMonth: null,
    gender: null,
    regionCode: null,
  },
};

function createTestApp(
  recognizer: SpeechRecognizer | null,
  rateLimiter: SpeechRateLimiter = {
    consume: async () => ({ allowed: true }),
  },
) {
  const authUseCase = {
    getSession: async (token?: string) =>
      token === "speech-test-token" ? authenticatedSession : null,
  } as unknown as IAuthUseCase;

  return createApp({
    ...createConcernDependencies(),
    ...createUserDependencies(),
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: "2026-09-25T00:00:00.000Z",
        database: "ok",
        version: "0.1.0",
      }),
    }),
    speechHandler: new SpeechHandler(
      new SpeechUseCase(
        recognizer,
        new VerifiedSpeechAudioDurationReader(),
        rateLimiter,
      ),
    ),
  });
}

function createAudioForm(
  options: { audio?: File; language?: string } = {},
): FormData {
  const form = new FormData();
  form.append(
    "audio",
    options.audio ??
      new File([createWavAudio(1)], "voice.wav", {
        type: "audio/wav",
      }),
  );
  if (options.language !== undefined) {
    form.append("language", options.language);
  }
  return form;
}

async function postTranscription(
  app: ReturnType<typeof createTestApp>,
  body: BodyInit,
  authenticated = true,
): Promise<Response> {
  return await app.request(
    "/api/v1/speech/transcriptions",
    {
      method: "POST",
      headers: authenticated
        ? { Cookie: `${SESSION_COOKIE_NAME}=speech-test-token` }
        : undefined,
      body,
    },
    env,
  );
}

describe("POST /api/v1/speech/transcriptions", () => {
  it("uses a deterministic recognizer only when the local development flag is enabled", async () => {
    const localBindings = {
      ...env,
      DEV_AUTH_ENABLED: "true",
      LOCAL_SPEECH_RECOGNIZER_ENABLED: "true",
    };
    const localApplication = createApplication(localBindings);
    const session = await localApplication.app.request(
      "/api/v1/auth/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userKey: "demo-a" }),
      },
      localBindings,
    );
    expect(session.status).toBe(200);
    const cookie = session.headers.get("set-cookie")?.split(";", 1)[0];
    expect(cookie).toBeTruthy();

    const localForm = createAudioForm();
    const localResponse = await localApplication.app.request(
      "/api/v1/speech/transcriptions",
      {
        method: "POST",
        headers: { Cookie: cookie! },
        body: localForm,
      },
      localBindings,
    );
    expect(localResponse.status).toBe(200);
    expect(await localResponse.json()).toEqual({
      text: "[local-dev transcript]",
      language: "ja",
    });

    const unconfiguredBindings = {
      ...env,
      DEV_AUTH_ENABLED: "true",
    };
    const unconfiguredApplication = createApplication(unconfiguredBindings);
    const unavailableResponse = await unconfiguredApplication.app.request(
      "/api/v1/speech/transcriptions",
      {
        method: "POST",
        headers: { Cookie: cookie! },
        body: createAudioForm(),
      },
      unconfiguredBindings,
    );
    expect(unavailableResponse.status).toBe(503);
    expect(await unavailableResponse.json()).toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE" },
    });
  });

  it("returns Japanese transcription for an authenticated multipart audio upload", async () => {
    const transcribe = vi.fn(
      async (_audio: ArrayBuffer) => " 今日は疲れました ",
    );
    const app = createTestApp({ transcribe });

    const response = await postTranscription(app, createAudioForm());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: "今日は疲れました",
      language: "ja",
    });
    expect(transcribe).toHaveBeenCalledOnce();
    expect(transcribe.mock.calls[0]?.[0]).toBeInstanceOf(ArrayBuffer);
  });

  it("accepts WebM with codec parameters and audio at the 60-second boundary", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const webmResponse = await postTranscription(
      app,
      createAudioForm({
        audio: new File([createWebmAudio(1)], "voice.webm", {
          type: "audio/webm;codecs=opus",
        }),
      }),
    );
    expect(webmResponse.status).toBe(200);

    const sixtySecondResponse = await postTranscription(
      app,
      createAudioForm({
        audio: new File([createWavAudio(60)], "voice.wav", {
          type: "audio/wav",
        }),
      }),
    );
    expect(sixtySecondResponse.status).toBe(200);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it("requires an authenticated user before reading audio", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const response = await postTranscription(app, createAudioForm(), false);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects non-multipart requests, missing audio, unsupported MIME, and language", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const wrongContentType = await app.request(
      "/api/v1/speech/transcriptions",
      {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=speech-test-token`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
      env,
    );
    expect(wrongContentType.status).toBe(415);
    expect(await wrongContentType.json()).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });

    const missingAudioForm = new FormData();
    const missingAudio = await postTranscription(app, missingAudioForm);
    expect(missingAudio.status).toBe(400);
    expect(await missingAudio.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });

    const unsupportedAudio = await postTranscription(
      app,
      createAudioForm({
        audio: new File([new Uint8Array([1])], "voice.ogg", {
          type: "audio/ogg",
        }),
      }),
    );
    expect(unsupportedAudio.status).toBe(415);
    expect(await unsupportedAudio.json()).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });

    const unsupportedLanguage = await postTranscription(
      app,
      createAudioForm({ language: "en" }),
    );
    expect(unsupportedLanguage.status).toBe(400);
    expect(await unsupportedLanguage.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects empty or oversized audio", async () => {
    const app = createTestApp({ transcribe: async () => "recognized" });

    const emptyAudio = await postTranscription(
      app,
      createAudioForm({
        audio: new File([], "empty.wav", { type: "audio/wav" }),
      }),
    );
    expect(emptyAudio.status).toBe(400);
    expect(await emptyAudio.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });

    const oversizedAudio = await postTranscription(
      app,
      createAudioForm({
        audio: new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], "large.wav", {
          type: "audio/wav",
        }),
      }),
    );
    expect(oversizedAudio.status).toBe(413);
    expect(await oversizedAudio.json()).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("rejects audio longer than 60 seconds before calling the recognizer", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const response = await postTranscription(
      app,
      createAudioForm({
        audio: new File([createWavAudio(60.01)], "long.wav", {
          type: "audio/wav",
        }),
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects malformed audio before calling the recognizer", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const response = await postTranscription(
      app,
      createAudioForm({
        audio: new File([Uint8Array.of(1, 2, 3)], "invalid.wav", {
          type: "audio/wav",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns 429 and Retry-After without calling the recognizer", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const consume = vi.fn(async () => ({
      allowed: false as const,
      retryAfterSeconds: 23,
    }));
    const app = createTestApp({ transcribe }, { consume });

    const response = await postTranscription(app, createAudioForm());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("23");
    expect(await response.json()).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect(consume).toHaveBeenCalledWith("speech-test-user");
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns a shared upstream error when recognition is unavailable or fails", async () => {
    const unavailable = createTestApp(null);
    const unavailableResponse = await postTranscription(
      unavailable,
      createAudioForm(),
    );
    expect(unavailableResponse.status).toBe(503);
    expect(await unavailableResponse.json()).toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE" },
    });

    const recognitionFailure = createTestApp({
      transcribe: async () => {
        throw new Error("private audio payload details");
      },
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await postTranscription(
        recognitionFailure,
        createAudioForm(),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "UPSTREAM_UNAVAILABLE" },
      });
      const logs = JSON.stringify([
        ...logSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]);
      expect(logs).not.toContain("private audio payload details");
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
