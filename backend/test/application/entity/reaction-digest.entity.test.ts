import { describe, expect, it } from "vitest";

import {
  ClaimedReactionDigestRun,
  ReactionDigestDelivery,
  ReactionDigestRunRequest,
  ReactionDigestStateError,
  ReactionDigestSummary,
} from "../../../src/application/entity/reaction-digest.entity";

function pendingDelivery(retryKey: string | null = null) {
  return new ReactionDigestDelivery({
    id: "delivery-1",
    runId: "run-1",
    status: retryKey ? "started" : "pending",
    retryKey,
    attemptedAt: retryKey ? "2026-09-26T11:00:00.000Z" : null,
    sentAt: null,
    response: null,
    errorCode: null,
    recipient: {
      lineUserId: "U123",
      displayLanguage: "original",
      isReachable: true,
    },
    summary: new ReactionDigestSummary({
      reactorCount: 1,
      sameRegionCount: 0,
      regionCount: 0,
      regionCode: null,
    }),
  });
}

describe("ReactionDigestRunRequest", () => {
  it("builds a Tokyo-date idempotency key for scheduled runs", () => {
    const request = ReactionDigestRunRequest.scheduled({
      // 2026-09-26T15:30Z は Asia/Tokyo では 9 月 27 日。
      scheduledAt: new Date("2026-09-26T15:30:00.000Z"),
      newRunId: "run-1",
      claimToken: "claim-1",
      requestedAt: new Date("2026-09-26T15:30:00.000Z"),
      leaseMilliseconds: 60_000,
    });

    expect(request.trigger).toBe("cron");
    expect(request.idempotencyKey).toBe("reaction-digest:cron:2026-09-27");
    expect(request.newRunIdempotencyKey).toBe(request.idempotencyKey);
    expect(request.leaseExpiresAt).toBe("2026-09-26T15:31:00.000Z");
  });

  it("gives each manual run its own key and rejects invalid leases", () => {
    const request = ReactionDigestRunRequest.manual({
      newRunId: "run-2",
      claimToken: "claim-2",
      requestedAt: new Date("2026-09-26T11:00:00.000Z"),
      leaseMilliseconds: 60_000,
    });
    expect(request.idempotencyKey).toBeNull();
    expect(request.newRunIdempotencyKey).toBe("reaction-digest:manual:run-2");

    expect(() =>
      ReactionDigestRunRequest.manual({
        newRunId: "run-3",
        claimToken: "claim-3",
        requestedAt: new Date(),
        leaseMilliseconds: 0,
      }),
    ).toThrow(ReactionDigestStateError);
  });
});

describe("ClaimedReactionDigestRun", () => {
  it("requires a running run", () => {
    const run = {
      runId: "run-1",
      trigger: "manual" as const,
      status: "pending" as const,
      cutoffAt: "2026-09-26T11:00:00.000Z",
      requestedAt: "2026-09-26T11:00:00.000Z",
      finishedAt: null,
      targetCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      remainingCount: 0,
    };
    expect(() => new ClaimedReactionDigestRun(run, "claim-1")).toThrow(
      ReactionDigestStateError,
    );
  });
});

describe("ReactionDigestDelivery", () => {
  it("moves from pending to started to sent", () => {
    const started = pendingDelivery().start(
      "retry-1",
      "2026-09-26T11:00:00.000Z",
    );
    expect(started.status).toBe("started");
    expect(started.retryKey).toBe("retry-1");

    const sent = started.markSent(
      { httpStatus: 200, requestId: "request-1" },
      "2026-09-26T11:00:01.000Z",
    );
    expect(sent).toMatchObject({
      status: "sent",
      sentAt: "2026-09-26T11:00:01.000Z",
      response: { httpStatus: 200, requestId: "request-1" },
    });
  });

  it("keeps the saved retry key when restarting an uncertain delivery", () => {
    const restarted = pendingDelivery("retry-saved").start(
      "retry-new",
      "2026-09-26T11:05:00.000Z",
    );
    expect(restarted.retryKey).toBe("retry-saved");
  });

  it("classifies failures by HTTP status", () => {
    const started = pendingDelivery("retry-1");
    expect(
      started.markFailed({ httpStatus: 429, requestId: null }).errorCode,
    ).toBe("rate_limited");
    expect(
      started.markFailed({ httpStatus: 503, requestId: null }).errorCode,
    ).toBe("upstream_unavailable");
    expect(
      started.markFailed({ httpStatus: 400, requestId: null }).errorCode,
    ).toBe("upstream_rejected");
  });

  it("rejects invalid transitions", () => {
    const pending = pendingDelivery();
    expect(() =>
      pending.markSent({ httpStatus: 200, requestId: null }, "2026-09-26"),
    ).toThrow(ReactionDigestStateError);

    const skipped = pending.skip("2026-09-26T11:00:00.000Z");
    expect(skipped).toMatchObject({
      status: "skipped",
      errorCode: "recipient_unreachable",
    });
    expect(() => skipped.start("retry-1", "2026-09-26")).toThrow(
      ReactionDigestStateError,
    );
  });
});
