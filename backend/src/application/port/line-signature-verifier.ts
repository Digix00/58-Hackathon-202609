export interface LineSignatureVerifier {
  verify(rawBody: Uint8Array, signature: string | null): Promise<boolean>;
}
