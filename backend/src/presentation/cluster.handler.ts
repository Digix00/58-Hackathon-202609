import { createFactory } from "hono/factory";
import { z } from "zod";
import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import { GENDERS } from "../application/entity/concern";
import { REGION_CODES } from "../application/entity/region-code";
import type { IClusterUseCase } from "../application/usecase/cluster.usecase";
import type { Bindings } from "../types";

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(4096).optional(),
    regionCode: z.enum(REGION_CODES).optional(),
    gender: z.enum(GENDERS).optional(),
  })
  .strict();
const cursorSchema = z
  .object({
    version: z.literal(1),
    afterId: z.string().min(1),
    regionCode: z.string().nullable(),
    gender: z.string().nullable(),
  })
  .strict();
const factory = createFactory<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

export class ClusterHandler {
  private readonly useCase: IClusterUseCase;

  constructor(useCase: IClusterUseCase) {
    this.useCase = useCase;
  }

  readonly requirePublished = factory.createHandlers(async (c, next) => {
    const cluster = await this.useCase.findPublishedById(
      c.req.param("clusterId") ?? "",
    );
    if (!cluster) {
      const requestId = getRequestId(c.req.raw);
      c.header("X-Request-Id", requestId);
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "テーマが見つかりません",
            requestId,
          },
        },
        404,
      );
    }
    await next();
  });

  readonly list = factory.createHandlers(async (c) => {
    const requestId = getRequestId(c.req.raw);
    c.header("X-Request-Id", requestId);
    const query = querySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "取得条件を確認してください",
            requestId,
          },
        },
        400,
      );
    }
    const { cursor, limit, regionCode, gender } = query.data;
    let afterId: string | undefined;
    if (cursor) {
      try {
        const value = cursorSchema.parse(
          JSON.parse(decodeURIComponent(atob(cursor))),
        );
        if (
          value.regionCode !== (regionCode ?? null) ||
          value.gender !== (gender ?? null)
        ) {
          throw new Error("テーマの取得条件が変わりました");
        }
        afterId = value.afterId;
      } catch {
        return c.json(
          {
            error: {
              code: "INVALID_CURSOR",
              message: "ページングカーソルが不正です",
              requestId,
            },
          },
          400,
        );
      }
    }
    const result = await this.useCase.listPublished({
      limit,
      afterId,
      regionCode,
      gender,
    });
    return c.json({
      items: result.items.map((cluster) => ({
        id: cluster.id,
        label: cluster.label!,
        summary: cluster.summary!,
        concernCount: cluster.concernCount,
      })),
      nextCursor: result.nextId
        ? btoa(
            encodeURIComponent(
              JSON.stringify({
                version: 1,
                afterId: result.nextId,
                regionCode: regionCode ?? null,
                gender: gender ?? null,
              }),
            ),
          )
        : null,
    });
  });
}
