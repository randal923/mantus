"use client";

import { useState, type FormEvent } from "react";
import type {
  AccountTier,
  Language,
  TurnModifier,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { RangeSlider } from "../ui/RangeSlider";
import { KeyBindingsView } from "./KeyBindingsView";

type MenuView = "menu" | "settings" | "hotkeys" | "email" | "password";

interface GameMenuModalProps {
  onClose: () => void;
  accountTier?: AccountTier;
  premiumDaysRemaining?: number;
  onChangeCharacter?: () => void;
  onLogout?: () => void | Promise<void>;
  onChangeEmail?: (email: string) => void;
  onChangePassword?: (currentPassword: string, newPassword: string) => void;
  onChangeLanguage?: (language: Language) => void;
  diagonalWalking?: boolean;
  onDiagonalWalkingChange?: (enabled: boolean) => void;
  turnModifier?: TurnModifier;
  onTurnModifierChange?: (modifier: TurnModifier) => void;
  /** World lightmap comfort floor, 0-100%. */
  minimumAmbientLight?: number;
  onMinimumAmbientLightChange?: (percent: number) => void;
  /** Drops every stored panel layout back to the client defaults. */
  onResetLayout?: () => void;
  languageSaving?: boolean;
  languageError?: boolean;
  initialView?: MenuView;
}

export function GameMenuModal({
  onClose,
  accountTier = "free",
  premiumDaysRemaining = 0,
  onChangeCharacter,
  onLogout,
  onChangeEmail,
  onChangePassword,
  onChangeLanguage,
  diagonalWalking = true,
  onDiagonalWalkingChange,
  turnModifier = "Shift",
  onResetLayout,
  onTurnModifierChange,
  minimumAmbientLight = 25,
  onMinimumAmbientLightChange,
  languageSaving = false,
  languageError = false,
  initialView = "menu",
}: GameMenuModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const [view, setView] = useState<MenuView>(initialView);
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const languageOptions: ReadonlyArray<{ value: Language; label: string }> = [
    { value: "en", label: t("languages.en") },
    { value: "pt-BR", label: t("languages.pt-BR") },
  ];
  const turnModifierOptions: ReadonlyArray<{
    value: TurnModifier;
    label: string;
  }> = [
    { value: "Shift", label: t("hotkeys.modifiers.shift") },
    { value: "Alt", label: t("hotkeys.modifiers.alt") },
    { value: "Control", label: t("hotkeys.modifiers.control") },
    { value: "Meta", label: t("hotkeys.modifiers.meta") },
  ];
  const viewTitles: Readonly<Record<MenuView, string>> = {
    menu: t("menu.title"),
    settings: t("settings.title"),
    hotkeys: t("hotkeys.title"),
    email: t("settings.changeEmail"),
    password: t("settings.changePassword"),
  };

  const logout = async () => {
    if (!onLogout) return;
    setActionBusy(true);
    setActionError(false);
    try {
      await onLogout();
      onClose();
    } catch {
      setActionError(true);
    } finally {
      setActionBusy(false);
    }
  };

  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    onChangeEmail?.(email);
    setEmail("");
    setView("settings");
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    onChangePassword?.(currentPassword, newPassword);
    setCurrentPassword("");
    setNewPassword("");
    setView("settings");
  };

  return (
    <Modal title={viewTitles[view]} onClose={onClose} height="auto">
      {view === "menu" && (
        <nav aria-label={t("menu.actions")} className="flex flex-col gap-2">
          <Button
            variant="primary"
            className="w-full justify-between"
            onClick={() => setView("settings")}
          >
            {t("menu.settings")}
            <span aria-hidden>›</span>
          </Button>
          <Button
            className="w-full"
            disabled={!onChangeCharacter}
            onClick={onChangeCharacter}
          >
            {t("menu.changeCharacter")}
          </Button>
          <Button
            variant="danger"
            className="w-full"
            disabled={!onLogout || actionBusy}
            onClick={() => void logout()}
          >
            {actionBusy ? t("menu.loggingOut") : t("menu.logout")}
          </Button>
          {actionError && (
            <p
              role="alert"
              className="border-l-2 border-ui-accent bg-ui-accent/10 px-3 py-2 text-sm text-red-200"
            >
              {t("menu.logoutFailed")}
            </p>
          )}
          <p className="mt-2 text-center text-xs tracking-wider text-ui-muted uppercase">
            {t("menu.returnHint")}
          </p>
        </nav>
      )}

      {view === "settings" && (
        <div className="flex flex-col gap-5">
          <Dropdown
            ariaLabel={t("languages.label")}
            label={t("languages.label")}
            value={language}
            options={languageOptions}
            disabled={languageSaving}
            onChange={(nextLanguage) => {
              if (onChangeLanguage) {
                onChangeLanguage(nextLanguage);
                return;
              }
              setLanguage(nextLanguage);
            }}
          />
          {languageSaving && (
            <p className="text-sm text-ui-muted">{t("languages.saving")}</p>
          )}
          {languageError && (
            <p role="alert" className="text-sm text-red-200">
              {t("languages.saveFailed")}
            </p>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("settings.controls")}
            </h3>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-stone-light/15 bg-black/20 px-3 py-3">
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium text-ui-text">
                  {t("settings.diagonalWalking")}
                </span>
                <span className="text-sm leading-6 text-ui-muted">
                  {t("settings.diagonalWalkingDescription")}
                </span>
              </span>
              <Checkbox
                checked={diagonalWalking}
                disabled={!onDiagonalWalkingChange}
                aria-label={t("settings.diagonalWalking")}
                onChange={(event) =>
                  onDiagonalWalkingChange?.(event.currentTarget.checked)
                }
                className="shrink-0"
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-stone-light/15 bg-black/20 px-3 py-3">
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium text-ui-text">
                  {t("settings.turnModifier")}
                </span>
                <span className="text-sm leading-6 text-ui-muted">
                  {t("settings.turnModifierDescription")}
                </span>
              </span>
              <Dropdown
                ariaLabel={t("settings.turnModifier")}
                value={turnModifier}
                options={turnModifierOptions}
                disabled={!onTurnModifierChange}
                onChange={(value) => onTurnModifierChange?.(value)}
                className="w-36 shrink-0"
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("settings.graphics")}
            </h3>
            <div className="flex flex-col gap-2 rounded-lg border border-ui-stone-light/15 bg-black/20 px-3 py-3">
              <RangeSlider
                label={t("settings.minimumAmbientLight")}
                value={minimumAmbientLight}
                min={0}
                max={100}
                unit="%"
                disabled={!onMinimumAmbientLightChange}
                onChange={(percent) => onMinimumAmbientLightChange?.(percent)}
              />
              <span className="text-sm leading-6 text-ui-muted">
                {t("settings.minimumAmbientLightDescription")}
              </span>
            </div>
          </section>

          <Button className="w-full" onClick={() => setView("hotkeys")}>
            {t("settings.hotkeyMapping")}
          </Button>

          <Button
            variant="secondary"
            className="w-full"
            disabled={!onResetLayout}
            onClick={() => onResetLayout?.()}
          >
            {t("settings.resetLayout")}
          </Button>

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("settings.account")}
            </h3>
            <p className="flex items-center justify-between rounded-lg border border-ui-stone-light/15 bg-black/20 px-3 py-2 text-sm text-ui-text">
              <span>{t("settings.accountTier")}</span>
              <span className="font-medium text-ui-gold">
                {accountTier === "premium"
                  ? t("settings.premiumDaysRemaining", {
                      count: premiumDaysRemaining,
                    })
                  : t("settings.accountTiers.free")}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={() => setView("email")}>
                {t("settings.changeEmail")}
              </Button>
              <Button size="sm" onClick={() => setView("password")}>
                {t("settings.changePassword")}
              </Button>
            </div>
          </section>

          <Button
            size="sm"
            className="self-start"
            onClick={() => setView("menu")}
          >
            ‹ {t("common.back")}
          </Button>
        </div>
      )}

      {view === "hotkeys" && (
        <KeyBindingsView onBack={() => setView("settings")} />
      )}

      {view === "email" && (
        <form onSubmit={submitEmail} className="flex flex-col gap-4">
          <Input
            label={t("settings.newEmail")}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setView("settings")}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              type="submit"
              variant="primary"
              disabled={!onChangeEmail}
            >
              {t("settings.updateEmail")}
            </Button>
          </div>
        </form>
      )}

      {view === "password" && (
        <form onSubmit={submitPassword} className="flex flex-col gap-4">
          <Input
            label={t("settings.currentPassword")}
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
          />
          <Input
            label={t("settings.newPassword")}
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.currentTarget.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setView("settings")}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              type="submit"
              variant="primary"
              disabled={!onChangePassword}
            >
              {t("settings.updatePassword")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
