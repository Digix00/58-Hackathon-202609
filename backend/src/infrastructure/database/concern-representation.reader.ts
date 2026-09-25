import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { ConcernTextRepresentation } from "../../application/entity/concern";
import { concernRepresentations } from "./schema";

/** 複数投稿の表現をまとめて取得し、投稿IDごとに返す。 */
export async function loadConcernRepresentations(
  db: ReturnType<typeof drizzle>,
  concernIds: readonly string[],
): Promise<Map<string, ConcernTextRepresentation[]>> {
  const result = new Map<string, ConcernTextRepresentation[]>();
  if (concernIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      concernId: concernRepresentations.concernId,
      locale: concernRepresentations.locale,
      body: concernRepresentations.body,
      status: concernRepresentations.status,
    })
    .from(concernRepresentations)
    .where(inArray(concernRepresentations.concernId, [...concernIds]))
    .all();

  for (const row of rows) {
    const representations = result.get(row.concernId) ?? [];
    representations.push({
      locale: row.locale as ConcernTextRepresentation["locale"],
      body: row.body,
      status: row.status as ConcernTextRepresentation["status"],
    });
    result.set(row.concernId, representations);
  }

  return result;
}
