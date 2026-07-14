export interface VerifiedUser {
  supabaseUserId: string;
  email: string | null;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedUser>;
}
