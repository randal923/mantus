import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { TokenVerifier, VerifiedUser } from "./TokenVerifier";

export interface SupabaseTokenVerifierOptions {
  supabaseUrl: string;
  jwtSecret?: string;
}

/**
 * Verifies Supabase-issued access tokens. Projects with modern asymmetric
 * signing keys are verified against the public JWKS endpoint; legacy projects
 * use the shared HS256 secret. Tokens are never logged (charter rule 9).
 */
export class SupabaseTokenVerifier implements TokenVerifier {
  private readonly verifyToken: (token: string) => Promise<JWTPayload>;

  constructor(options: SupabaseTokenVerifierOptions) {
    const issuer = `${options.supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
    if (options.jwtSecret) {
      const secret = new TextEncoder().encode(options.jwtSecret);
      const claims = { issuer, audience: "authenticated", algorithms: ["HS256"] };
      this.verifyToken = async (token) =>
        (await jwtVerify(token, secret, claims)).payload;
    } else {
      const jwks = createRemoteJWKSet(
        new URL(`${issuer}/.well-known/jwks.json`),
      );
      const claims = {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256"],
      };
      this.verifyToken = async (token) =>
        (await jwtVerify(token, jwks, claims)).payload;
    }
  }

  async verify(token: string): Promise<VerifiedUser> {
    const payload = await this.verifyToken(token);
    if (!payload.sub) throw new Error("token has no subject");
    return {
      supabaseUserId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  }
}
