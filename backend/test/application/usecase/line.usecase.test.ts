import { describe, expect, it } from "vitest";

import type {
  ClaimDailyBroadcastInput,
  LineRepository,
} from "../../../src/application/repository/line.repository";
import { LineUseCase } from "../../../src/application/usecase/line.usecase";

describe("LineUseCase daily quiz runner", () => {
  it("ensures the Tokyo-date quiz before claiming and sending the broadcast", async () => {
    const calls: string[] = [];
    let status: "running" | "succeeded" = "running";
    let requestedDate = "";
    const lineUseCase = new LineUseCase(
      createRepository({
        claimDailyBroadcast: async (input) => {
          calls.push("claim");
          requestedDate = input.quizDate;
          return {
            status: "claimed",
            broadcastId: "broadcast-1",
            claimToken: input.claimToken,
            attempt: {
              id: "attempt-1",
              attemptNumber: 1,
              retryKey: "retry-1",
            },
          };
        },
        completeDailyBroadcast: async () => {
          calls.push("complete");
          status = "succeeded";
        },
        findDailyBroadcast: async (quizDate) => ({
          quizDate,
          quizId: "quiz-1",
          quizStatus: "published",
          broadcastStatus: status,
          requestedAt: "2099-12-29T15:00:00.000Z",
          sentAt: status === "succeeded" ? "2099-12-29T15:00:01.000Z" : null,
          finishedAt:
            status === "succeeded" ? "2099-12-29T15:00:01.000Z" : null,
        }),
      }),
      { verify: async () => true },
      {
        isConfigured: () => true,
        sendDailyQuiz: async () => {
          calls.push("send");
          return {
            status: "accepted",
            httpStatus: 200,
            requestId: "request-1",
            acceptedRequestId: null,
          };
        },
      },
      {
        ensureDailyQuiz: async (quizDate) => {
          calls.push("ensure");
          requestedDate = quizDate;
          return { id: "quiz-1", quizDate };
        },
      },
      "https://frontend.example",
      () => new Date("2099-12-29T15:00:00.000Z"),
      (() => {
        let id = 0;
        return () => `id-${(id += 1)}`;
      })(),
    );

    const result = await lineUseCase.triggerDailyRun();

    expect(requestedDate).toBe("2099-12-30");
    expect(calls).toEqual(["ensure", "claim", "send", "complete"]);
    expect(result).toMatchObject({
      status: "succeeded",
      view: {
        quizDate: "2099-12-30",
        quizId: "quiz-1",
        broadcastStatus: "succeeded",
      },
    });
  });

  it("does not call the LINE sender when quiz generation has no published result", async () => {
    const calls: string[] = [];
    const lineUseCase = new LineUseCase(
      createRepository({
        findDailyBroadcast: async (quizDate) => ({
          quizDate,
          quizId: null,
          quizStatus: "missing",
          broadcastStatus: "not_started",
          requestedAt: null,
          sentAt: null,
          finishedAt: null,
        }),
      }),
      { verify: async () => true },
      {
        isConfigured: () => true,
        sendDailyQuiz: async () => {
          calls.push("send");
          return {
            status: "accepted",
            httpStatus: 200,
            requestId: null,
            acceptedRequestId: null,
          };
        },
      },
      {
        ensureDailyQuiz: async () => {
          calls.push("ensure");
          return null;
        },
      },
      "https://frontend.example",
      () => new Date("2099-12-29T15:00:00.000Z"),
    );

    const result = await lineUseCase.triggerDailyRun();

    expect(result.status).toBe("quiz_not_available");
    expect(result.view.quizStatus).toBe("missing");
    expect(calls).toEqual(["ensure"]);
  });
});

function createRepository(
  overrides: Partial<LineRepository> = {},
): LineRepository {
  return {
    recordWebhookEvent: async () => "processed",
    findDailyBroadcast: async (quizDate) => ({
      quizDate,
      quizId: null,
      quizStatus: "missing",
      broadcastStatus: "not_started",
      requestedAt: null,
      sentAt: null,
      finishedAt: null,
    }),
    claimDailyBroadcast: async (input: ClaimDailyBroadcastInput) => ({
      status: "claimed",
      broadcastId: "broadcast-1",
      claimToken: input.claimToken,
      attempt: { id: "attempt-1", attemptNumber: 1, retryKey: "retry-1" },
    }),
    completeDailyBroadcast: async () => undefined,
    failDailyBroadcast: async () => undefined,
    recordUncertainDailyBroadcast: async () => undefined,
    ...overrides,
  };
}
