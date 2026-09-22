export interface LineIdentity {
  lineUserId: string;
}

export interface LineTokenVerifier {
  verify(idToken: string): Promise<LineIdentity>;
}

export class InvalidLineTokenError extends Error {
  constructor() {
    super("invalid LINE ID token");
    this.name = "InvalidLineTokenError";
  }
}

export class LineAuthConfigurationError extends Error {
  constructor() {
    super("LINE authentication is not configured");
    this.name = "LineAuthConfigurationError";
  }
}
