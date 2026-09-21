import {
  InvalidLineTokenError,
  LineAuthConfigurationError,
  type LineIdentity,
  type LineTokenVerifier,
} from "../../application/port/line-token-verifier";

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
    fetcher: typeof fetch = fetch,
  ) {
    this.channelId = channelId;
    this.fetcher = fetcher;
  }

  async verify(idToken: string): Promise<LineIdentity> {
    if (!this.channelId) {
      throw new LineAuthConfigurationError();
    }

    if (!idToken || idToken.length > MAX_ID_TOKEN_LENGTH) {
      throw new InvalidLineTokenError();
    }

    const response = await this.fetcher(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: this.channelId,
      }),
    });

    if (!response.ok) {
      throw new InvalidLineTokenError();
    }

    const payload = (await response.json()) as LineVerifyResponse;
    if (
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      (payload.iss !== undefined && payload.iss !== LINE_ISSUER) ||
      (payload.aud !== undefined && payload.aud !== this.channelId) ||
      (typeof payload.exp === "number" &&
        payload.exp <= Math.floor(Date.now() / 1000))
    ) {
      throw new InvalidLineTokenError();
    }

    return { lineUserId: payload.sub };
  }
}
