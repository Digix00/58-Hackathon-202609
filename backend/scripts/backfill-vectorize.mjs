import process from "node:process";

const API_BASE_URL = "https://api.cloudflare.com/client/v4";
const QUEUE_NAME = "58-hackathon-concern-processing";
const PAGE_SIZE = 100;
const STALE_PROCESSING_MS = 30 * 60 * 1000;
const CONCERN_PROCESSING_MESSAGE_TYPE = "concern.process";

class CloudflareApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
  }
}

function requireEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(
    "Usage: pnpm --filter backend vectorize:backfill [-- --apply]\n\n" +
      "Without --apply, prints the number of unvectorized concerns. " +
      "With --apply, claims each eligible concern and sends its normal processing message to Cloudflare Queues.\n",
  );
  process.exit(0);
}

const accountId = requireEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID");
const apiToken = requireEnvironmentVariable("CLOUDFLARE_API_TOKEN");
const databaseId = requireEnvironmentVariable("CLOUDFLARE_D1_DATABASE_ID");
const apply = process.argv.includes("--apply");
const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
const candidateCondition = `embedding_version IS NULL AND (
  processing_status IN ('ready', 'failed')
  OR (processing_status = 'processing' AND updated_at < ?)
)`;

async function cloudflareRequest(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new CloudflareApiError(
      response.status,
      `Cloudflare API returned a non-JSON response (${response.status})`,
    );
  }

  if (!response.ok || payload.success !== true) {
    const messages = Array.isArray(payload.errors)
      ? payload.errors
          .map((error) => error.message)
          .filter((message) => typeof message === "string")
          .join("; ")
      : "";
    throw new CloudflareApiError(
      response.status,
      messages || `Cloudflare API request failed (${response.status})`,
    );
  }

  return payload;
}

async function queryDatabase(sql, params = []) {
  const response = await cloudflareRequest(
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    { sql, params },
  );
  const result = response.result?.[0];
  if (!result?.success) {
    throw new Error("Cloudflare D1 query did not succeed");
  }
  return result;
}

async function findQueueId() {
  const response = await cloudflareRequest(
    `/accounts/${accountId}/queues?per_page=100`,
  );
  const queue = response.result?.find(
    (candidate) => candidate.queue_name === QUEUE_NAME,
  );
  if (!queue?.queue_id) {
    throw new Error(`Cloudflare Queue was not found: ${QUEUE_NAME}`);
  }
  return queue.queue_id;
}

async function restoreClaim(concern, claimedAt) {
  await queryDatabase(
    `UPDATE concerns
     SET processing_status = ?, updated_at = ?
     WHERE id = ?
       AND processing_status = 'processing'
       AND embedding_version IS NULL
       AND updated_at = ?`,
    [concern.processing_status, concern.updated_at, concern.id, claimedAt],
  );
}

async function sendConcernMessage(queueId, concern) {
  await cloudflareRequest(`/accounts/${accountId}/queues/${queueId}/messages`, {
    body: {
      type: CONCERN_PROCESSING_MESSAGE_TYPE,
      concernId: concern.id,
      body: concern.body,
    },
    content_type: "json",
  });
}

async function main() {
  const countResult = await queryDatabase(
    `SELECT COUNT(*) AS count FROM concerns WHERE ${candidateCondition}`,
    [staleBefore],
  );
  const candidateCount = Number(countResult.results?.[0]?.count ?? 0);

  if (!Number.isSafeInteger(candidateCount) || candidateCount < 0) {
    throw new Error("Cloudflare D1 returned an invalid backfill count");
  }

  if (candidateCount === 0) {
    process.stdout.write("Vectorize backfill:対象投稿はありません。\n");
    return;
  }

  process.stdout.write(
    `Vectorize backfill:Embedding version未登録の対象は${candidateCount}件です。\n`,
  );
  if (!apply) {
    process.stdout.write(
      "dry-runです。Queueへ送るには --apply を指定してください。\n",
    );
    return;
  }

  const queueId = await findQueueId();
  let cursor = "";
  let enqueuedCount = 0;

  while (true) {
    const rowsResult = await queryDatabase(
      `SELECT id, body, processing_status, updated_at
       FROM concerns
       WHERE ${candidateCondition} AND id > ?
       ORDER BY id
       LIMIT ${PAGE_SIZE}`,
      [staleBefore, cursor],
    );
    const concerns = rowsResult.results ?? [];
    if (concerns.length === 0) {
      break;
    }

    for (const concern of concerns) {
      cursor = concern.id;
      const claimedAt = new Date().toISOString();
      const claimResult = await queryDatabase(
        `UPDATE concerns
         SET processing_status = 'processing', updated_at = ?
         WHERE id = ?
           AND embedding_version IS NULL
           AND (
             processing_status IN ('ready', 'failed')
             OR (processing_status = 'processing' AND updated_at < ?)
           )`,
        [claimedAt, concern.id, staleBefore],
      );

      if (claimResult.meta?.changes !== 1) {
        continue;
      }

      try {
        await sendConcernMessage(queueId, concern);
        enqueuedCount += 1;
      } catch (error) {
        if (error instanceof CloudflareApiError && error.status < 500) {
          await restoreClaim(concern, claimedAt).catch(() => undefined);
        }
        throw new Error(
          `Queueへの登録が${enqueuedCount}件完了した後に失敗しました。処理状態を確認してから再実行してください。`,
          { cause: error },
        );
      }
    }

    if (concerns.length < PAGE_SIZE) {
      break;
    }
  }

  process.stdout.write(
    `Vectorize backfill:Queueへ${enqueuedCount}件を登録しました。処理完了後に embedding_version が更新されます。\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `Vectorize backfill failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
