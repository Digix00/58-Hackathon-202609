import {
  InvalidLineTokenError,
  LineAuthConfigurationError,
  type LineIdentity,
  type LineTokenVerifier,
} from "../../application/port/line-token-verifier";
import { logError, logInfo } from "../../logger";

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const LINE_ISSUER = "https://access.line.me";
const MAX_ID_TOKEN_LENGTH = 4096;

interface LineVerifyResponse {
  sub?: unknown;
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
}

export class LineApiClient implements LineTokenVerifier {
  private readonly channelId: string | undefined;
  private readonly fetcher: typeof fetch;

  constructor(
    channelId: string | undefined,
    fetcher: typeof fetch = fetch.bind(globalThis),
  ) {
    this.channelId = channelId;
    this.fetcher = fetcher;
  }

  async verify(idToken: string): Promise<LineIdentity> {
    if (!this.channelId) {
      logError("LINE_CHANNEL_ID is not configured");
      throw new LineAuthConfigurationError();
    }

    if (!idToken || idToken.length > MAX_ID_TOKEN_LENGTH) {
      logError("received an empty or oversized LINE ID token", {
        length: idToken?.length ?? 0,
      });
      throw new InvalidLineTokenError();
    }

    let response: Response;
    try {
      response = await this.fetcher(LINE_VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          id_token: idToken,
          client_id: this.channelId,
        }),
      });
    } catch (error) {
      logError("failed to call the LINE token verification API", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    if (!response.ok) {
      logError("LINE token verification API returned an error response", {
        status: response.status,
      });
      throw new InvalidLineTokenError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      logError("failed to parse the LINE token verification response", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InvalidLineTokenError();
    }

    const invalidClaim = findInvalidClaim(payload, this.channelId);
    if (invalidClaim) {
      logError("LINE ID token failed claim validation", {
        reason: invalidClaim,
      });
      throw new InvalidLineTokenError();
    }

    logInfo("LINE token verification succeeded");

    return { lineUserId: (payload as LineVerifyResponse).sub as string };
  }
}

/** 検証レスポンスの必須クレームを確認し、診断用に不正の理由を返す。問題なければnull。 */
function findInvalidClaim(
  payload: unknown,
  channelId: string,
): string | null {
  if (!isLineVerifyResponse(payload)) {
    return "malformed_response";
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return "missing_sub";
  }
  if (payload.iss !== LINE_ISSUER) {
    return "iss_mismatch";
  }
  if (payload.aud !== channelId) {
    return "aud_mismatch";
  }
  if (typeof payload.exp !== "number") {
    return "missing_exp";
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return "expired";
  }
  return null;
}

function isLineVerifyResponse(value: unknown): value is LineVerifyResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
