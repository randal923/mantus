"use client";

import { useState } from "react";
import { usePublicAuthSession } from "../../hooks/usePublicAuthSession";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LoginModal } from "../auth/LoginModal";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import type { ButtonSize, ButtonVariant } from "../ui/buttonStyles";

interface PublicAuthActionProps {
  readonly className?: string;
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
  /** Label shown to visitors instead of "Log In". */
  readonly guestLabel?: string;
}

export function PublicAuthAction({
  className = "",
  size = "md",
  variant = "primary",
  guestLabel,
}: PublicAuthActionProps) {
  const { t } = useAppTranslation();
  const signedIn = usePublicAuthSession();
  const [loginOpen, setLoginOpen] = useState(false);

  if (signedIn) {
    return (
      <ButtonLink
        href="/play"
        variant={variant}
        size={size}
        className={`portal-cta ${className}`}
      >
        {t("landing.nav.play")}
      </ButtonLink>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={`portal-cta ${className}`}
        onClick={() => setLoginOpen(true)}
      >
        {guestLabel ?? t("publicSite.logIn")}
      </Button>
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </>
  );
}
