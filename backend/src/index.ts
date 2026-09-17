import { env } from "cloudflare:workers";

import { createApplication } from "./bootstrap/container";

// Composition Root: Workerのモジュール初期化時に依存グラフを一度だけ構築する。
// 各リクエストで行うのは、完成済みappへのdispatchだけ。
const app = createApplication(env);

export type { AppType } from "./app/create-app";
export default app;
