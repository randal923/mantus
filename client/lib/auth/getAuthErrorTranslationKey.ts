type AuthErrorTranslationKey =
  | "auth.errors.emailAlreadyExists"
  | "auth.errors.emailNotConfirmed"
  | "auth.errors.invalidCredentials"
  | "auth.errors.invalidEmail"
  | "auth.errors.providerDisabled"
  | "auth.errors.rateLimited"
  | "auth.errors.signupDisabled"
  | "auth.errors.unexpected"
  | "auth.errors.weakPassword";

export function getAuthErrorTranslationKey(
  code: string | undefined,
): AuthErrorTranslationKey {
  switch (code) {
    case "invalid_credentials":
      return "auth.errors.invalidCredentials";
    case "email_not_confirmed":
      return "auth.errors.emailNotConfirmed";
    case "email_exists":
    case "user_already_exists":
      return "auth.errors.emailAlreadyExists";
    case "weak_password":
      return "auth.errors.weakPassword";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "auth.errors.rateLimited";
    case "signup_disabled":
      return "auth.errors.signupDisabled";
    case "provider_disabled":
    case "email_provider_disabled":
      return "auth.errors.providerDisabled";
    case "email_address_invalid":
      return "auth.errors.invalidEmail";
    default:
      return "auth.errors.unexpected";
  }
}
