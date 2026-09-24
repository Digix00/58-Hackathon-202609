import { env } from "cloudflare:workers";

import { createApplication } from "./bootstrap/container";

// Composition Root: Workerのモジュール初期化時に依存グラフを一度だけ構築する。
// 各イベントで行うのは、完成済みのHTTP appまたはQueue handlerへのdispatchだけ。
const application = createApplication(env);

export type { AppType } from "./app/create-app";
export default {
  fetch: application.app.fetch,
  queue: application.queue,
  scheduled: async (controller: { scheduledTime: number }) => {
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
