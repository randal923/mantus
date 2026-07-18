import type { TokenVerifier, VerifiedUser } from "./TokenVerifier";

const DEV_TOKEN_PATTERN = /^dev-[a-z0-9][a-z0-9-]{0,30}$/;

/**
 * Development-only verifier: accepts tokens like `dev-alice` and maps each to
 * a deterministic local account. Wired in only when DEV_AUTH=1 (never in
 * production); it must never coexist with real Supabase accounts because the
 * token itself is the identity.
 */
export class DevTokenVerifier implements TokenVerifier {
  async verify(token: string): Promise<VerifiedUser> {
    if (!DEV_TOKEN_PATTERN.test(token)) {
      throw new Error("invalid dev token");
    }
    return {
      supabaseUserId: `dev:${token}`,
      email: `${token}@dev.local`,
    };
  }
}
