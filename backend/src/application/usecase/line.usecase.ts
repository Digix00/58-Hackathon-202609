import type {
  ClaimDailyBroadcastResult,
  DailyBroadcastView,
  LineWebhookEvent,
} from "../entity/line-integration.entity";
import type { DailyQuizProvider } from "../port/daily-quiz-provider";
import type { LineBroadcastSender } from "../port/line-broadcast-sender";
import type { LineSignatureVerifier } from "../port/line-signature-verifier";
import type { LineRepository } from "../repository/line.repository";
import { generateId } from "../shared/id-generator";

export class InvalidLineSignatureError extends Error {
  constructor() {
    super("invalid LINE webhook signature");
    this.name = "InvalidLineSignatureError";
  }
}

export class InvalidLineWebhookPayloadError extends Error {
  constructor() {
    super("invalid LINE webhook payload");
    this.name = "InvalidLineWebhookPayloadError";
  }
}

export class LineIntegrationConfigurationError extends Error {
  constructor() {
    super("LINE integration is not configured");
    this.name = "LineIntegrationConfigurationError";
  }
}

export interface DailyBroadcastExecution {
  status: "succeeded" | "in_progress" | "failed" | "not_available";
  broadcastId: string | null;
  view: DailyBroadcastView | null;
}

export interface DailyQuizRunResult {
  status: "quiz_not_available" | "succeeded" | "in_progress" | "failed";
  view: DailyBroadcastView;
}

/** LINE webhook とデイリークイズ配信の業務フローを扱うUseCase。 */
export class LineUseCase {
  private readonly repository: LineRepository;
  private readonly signatureVerifier: LineSignatureVerifier;
  private readonly broadcastSender: LineBroadcastSender;
  private readonly dailyQuizProvider: DailyQuizProvider;
  private readonly frontendUrl: string | undefined;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    repository: LineRepository,
    signatureVerifier: LineSignatureVerifier,
    broadcastSender: LineBroadcastSender,
    dailyQuizProvider: DailyQuizProvider,
    frontendUrl: string | undefined,
    now: () => Date = () => new Date(),
    createId: () => string = generateId,
  ) {
    this.repository = repository;
    this.signatureVerifier = signatureVerifier;
    this.broadcastSender = broadcastSender;
    this.dailyQuizProvider = dailyQuizProvider;
    this.frontendUrl = frontendUrl;
    this.now = now;
    this.createId = createId;
  }

  readonly receiveWebhook = async (
    rawBody: Uint8Array,
    signature: string | null,
  ): Promise<void> => {
    if (!(await this.signatureVerifier.verify(rawBody, signature))) {
      throw new InvalidLineSignatureError();
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      throw new InvalidLineWebhookPayloadError();
    }

    const events = parseWebhookEvents(payload);
    if (!events) {
      throw new InvalidLineWebhookPayloadError();
    }

    const receivedAt = this.now().toISOString();
    for (const event of events) {
      await this.repository.recordWebhookEvent(
        event,
        receivedAt,
        this.createId(),
      );
    }
  };

  readonly getDailyBroadcast = async (
    quizDate = toTokyoQuizDate(this.now()),
  ): Promise<DailyBroadcastView> =>
    this.repository.findDailyBroadcast(quizDate);

  readonly executeDailyBroadcast = async (
    quizId: string,
    quizDate = toTokyoQuizDate(this.now()),
  ): Promise<DailyBroadcastExecution> => {
    if (!this.broadcastSender.isConfigured()) {
      throw new LineIntegrationConfigurationError();
    }
    const quizUrl = this.getQuizUrl();

    const now = this.now();
    const claimToken = this.createId();
    const claimed = await this.repository.claimDailyBroadcast({
      quizId,
      quizDate,
      now: now.toISOString(),
      broadcastId: this.createId(),
      claimToken,
      leaseExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
      attemptId: this.createId(),
      retryKey: this.createId(),
    });

    if (claimed.status !== "claimed") {
      return resultFromClaim(claimed);
    }

    let response;
    try {
      response = await this.broadcastSender.sendDailyQuiz(
        quizUrl,
        claimed.attempt.retryKey,
      );
    } catch {
      response = { status: "unknown" as const };
    }

    if (response.status === "unknown") {
      await this.repository.recordUncertainDailyBroadcast({
        broadcastId: claimed.broadcastId,
        claimToken: claimed.claimToken,
        attemptId: claimed.attempt.id,
      });
      return {
        status: "in_progress",
        broadcastId: claimed.broadcastId,
        view: await this.repository.findDailyBroadcast(quizDate),
      };
    }

    const finishInput = {
      broadcastId: claimed.broadcastId,
      claimToken: claimed.claimToken,
      attemptId: claimed.attempt.id,
      httpStatus: response.httpStatus,
      requestId: response.requestId,
      acceptedRequestId: response.acceptedRequestId,
      finishedAt: this.now().toISOString(),
    };

    if (response.status === "accepted") {
      await this.repository.completeDailyBroadcast(finishInput);
      return {
        status: "succeeded",
        broadcastId: claimed.broadcastId,
        view: await this.repository.findDailyBroadcast(quizDate),
      };
    }

    await this.repository.failDailyBroadcast({
      ...finishInput,
      errorCode: "upstream_rejected",
    });
    return {
      status: "failed",
      broadcastId: claimed.broadcastId,
      view: await this.repository.findDailyBroadcast(quizDate),
    };
  };

  readonly triggerDailyRun = async (
    at: Date = this.now(),
  ): Promise<DailyQuizRunResult> => {
    const quizDate = toTokyoQuizDate(at);
    const quiz = await this.dailyQuizProvider.ensureDailyQuiz(quizDate);
    if (!quiz) {
      return {
        status: "quiz_not_available",
        view: await this.repository.findDailyBroadcast(quizDate),
      };
    }

    const result = await this.executeDailyBroadcast(quiz.id, quizDate);
    if (result.status === "not_available") {
      return {
        status: "quiz_not_available",
        view: await this.repository.findDailyBroadcast(quizDate),
      };
    }
    return {
      status: result.status,
      view: result.view ?? (await this.repository.findDailyBroadcast(quizDate)),
    };
  };

  private getQuizUrl(): string {
    if (!this.frontendUrl) {
      throw new LineIntegrationConfigurationError();
    }

    try {
      return new URL("/quiz/today", this.frontendUrl).toString();
    } catch {
      throw new LineIntegrationConfigurationError();
    }
  }
}

function resultFromClaim(
  claimed: Exclude<ClaimDailyBroadcastResult, { status: "claimed" }>,
): DailyBroadcastExecution {
  if (claimed.status === "succeeded") {
    return {
      status: "succeeded",
      broadcastId: claimed.broadcastId,
      view: claimed.view,
    };
  }
  if (claimed.status === "in_progress") {
    return {
      status: "in_progress",
      broadcastId: claimed.broadcastId,
      view: claimed.view,
    };
  }
  return { status: "not_available", broadcastId: null, view: null };
}

function parseWebhookEvents(payload: unknown): LineWebhookEvent[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    return null;
  }

  const events: LineWebhookEvent[] = [];
  for (const item of payload.events) {
    if (
      !isRecord(item) ||
      typeof item.webhookEventId !== "string" ||
      item.webhookEventId.length === 0 ||
      typeof item.type !== "string"
    ) {
      return null;
    }

    const source = isRecord(item.source) ? item.source : null;
    const sourceType =
      source && typeof source.type === "string" ? source.type : null;
    const lineUserId =
      source && typeof source.userId === "string" && source.userId.length > 0
        ? source.userId
        : null;
    events.push({
      webhookEventId: item.webhookEventId,
      eventType: item.type,
      sourceType,
      lineUserId,
    });
  }

  return events;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTokyoQuizDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(date);
  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
