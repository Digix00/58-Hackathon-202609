import { env } from "cloudflare:workers";

import { createApplication } from "./bootstrap/container";

// Composition Root: Workerのモジュール初期化時に依存グラフを一度だけ構築する。
// 各イベントで行うのは、完成済みのHTTP appまたはQueue handlerへのdispatchだけ。
const application = createApplication(env);

// wrangler.jsonc の triggers.crons と一致させる。09:00 JST はクイズ、20:00 JST は寄りそい通知。
const REACTION_DIGEST_CRON = "0 11 * * *";

export type { AppType } from "./app/create-app";
export default {
  fetch: application.app.fetch,
  queue: application.queue,
  scheduled: async (controller: { cron: string; scheduledTime: number }) => {
    if (controller.cron === REACTION_DIGEST_CRON) {
      await runReactionDigest(new Date(controller.scheduledTime));
      return;
    }

    const result = await application.scheduled(
      new Date(controller.scheduledTime),
    );
    console.log(
      JSON.stringify({
        severity: result.status === "failed" ? "ERROR" : "INFO",
        message: "daily quiz cron completed",
        quizDate: result.view.quizDate,
        status: result.status,
        broadcastStatus: result.view.broadcastStatus,
      }),
    );
  },
};

async function runReactionDigest(scheduledAt: Date): Promise<void> {
  try {
    const result = await application.reactionDigestScheduled(scheduledAt);
    const { run } = result;
    console.log(
      JSON.stringify({
        severity: run.status === "failed" ? "ERROR" : "INFO",
        message: "reaction digest cron completed",
        runStatus: run.status,
        targetCount: run.targetCount,
        sentCount: run.sentCount,
        failedCount: run.failedCount,
        remainingCount: run.remainingCount,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        severity: "ERROR",
        message: "reaction digest cron failed",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
}
