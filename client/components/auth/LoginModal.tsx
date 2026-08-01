"use client";

import { createPortal } from "react-dom";
import { useLogin } from "../../hooks/useLogin";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal } from "../ui/Modal";
import { LoginPanel } from "./LoginPanel";

interface LoginModalProps {
  readonly onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const { t } = useAppTranslation();
  const login = useLogin(onClose);

  return createPortal(
    <Modal title={t("publicSite.logIn")} onClose={onClose} height="auto">
      <LoginPanel
        embedded
        onSignIn={login.signIn}
        onSignUp={login.signUp}
        onGoogle={login.signInWithGoogle}
        busy={login.busy}
        error={login.errorKey ? t(login.errorKey) : null}
        notice={
          login.showConfirmationNotice ? t("auth.confirmationNotice") : null
        }
      />
    </Modal>,
    document.body,
  );
}
