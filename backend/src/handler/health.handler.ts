import { createFactory } from "hono/factory";

import { newHealthRepository } from "../repository/health.repository";
import type { Bindings } from "../types";
import { checkHealth } from "../usecase/health.usecase";

const factory = createFactory<{ Bindings: Bindings }>();

// GET /health のハンドラ。
// Hono RPCの型推論を効かせるため、Context型を明示注釈せず
// createFactory経由でハンドラを作る(注釈するとc.json()の戻り値が
// 素のResponseに潰れ、クライアント側でレスポンス型を復元できなくなる)。
export const healthHandlers = factory.createHandlers(async (c) => {
  const repo = newHealthRepository(c.env.DB);
  const status = await checkHealth(repo);
  return c.json(status);
});
