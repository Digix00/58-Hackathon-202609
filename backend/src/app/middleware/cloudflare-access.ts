import type { Context, MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";

import type { Bindings } from "../../types";
import { getRequestId } from "../request-id";

type AccessMiddlewareEnvironment = { Bindings: Bindings };
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Cloudflare Access が付ける JWT を Worker 内でも署名・issuer・audience 検証する。 */
export const requireCloudflareAccess: MiddlewareHandler<
  AccessMiddlewareEnvironment
> = async (c, next) => {
  if (c.env.DEV_AUTH_ENABLED === "true" && c.env.DEV_ACCESS_BYPASS === "true") {
    await next();
    return;
  }

  const assertion = c.req.header("cf-access-jwt-assertion");
  const teamDomain = normalizeIssuer(c.env.ACCESS_TEAM_DOMAIN);
  const audience = c.env.ACCESS_AUD?.trim();
  if (!assertion || !teamDomain || !audience) {
    return accessDenied(c);
  }

  try {
    const jwks = getAccessJwks(teamDomain);
    await jwtVerify(assertion, jwks, {
      issuer: teamDomain,
      audience,
    });
  } catch {
    return accessDenied(c);
  }

  await next();
};

export function hasValidInternalToken(
  authorization: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!authorization || !expectedToken) {
    return false;
  }
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) {
    return false;
  }
  return constantTimeEqual(
    new TextEncoder().encode(match[1]),
    new TextEncoder().encode(expectedToken),
  );
}

function getAccessJwks(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = jwksByIssuer.get(issuer);
  if (existing) {
    return existing;
  }
  const jwks = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", issuer));
  jwksByIssuer.set(issuer, jwks);
  return jwks;
}

function normalizeIssuer(domain: string | undefined): string | null {
  if (!domain?.trim()) {
    return null;
  }
  try {
    const issuer = new URL(
      domain.includes("://") ? domain : `https://${domain}`,
    );
    if (issuer.protocol !== "https:" || issuer.pathname !== "/") {
      return null;
    }
    return issuer.origin;
  } catch {
    return null;
  }
}

function accessDenied(c: Context<AccessMiddlewareEnvironment>) {
  const requestId = getRequestId(c.req.raw);
  return c.json(
    {
      error: {
        code: "ADMIN_ACCESS_REQUIRED",
        message: "管理者として認証してください",
        requestId,
      },
    },
    401,
  );
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
