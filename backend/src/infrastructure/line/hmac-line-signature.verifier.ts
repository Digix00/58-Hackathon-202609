import type { LineSignatureVerifier } from "../../application/port/line-signature-verifier";

/** LINE Webhook の未加工 body に対する HMAC-SHA256 署名検証。 */
export class HmacLineSignatureVerifier implements LineSignatureVerifier {
  private readonly channelSecret: string | undefined;

  constructor(channelSecret: string | undefined) {
    this.channelSecret = channelSecret;
  }

  async verify(
    rawBody: Uint8Array,
    signature: string | null,
  ): Promise<boolean> {
    if (!this.channelSecret || !signature) {
      return false;
    }

    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(this.channelSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const rawBuffer = new ArrayBuffer(rawBody.byteLength);
      new Uint8Array(rawBuffer).set(rawBody);
      const digest = new Uint8Array(
        await crypto.subtle.sign("HMAC", key, rawBuffer),
      );
      const actual = decodeBase64(signature);
      return actual !== null && constantTimeEqual(digest, actual);
    } catch {
      return false;
    }
  }
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
