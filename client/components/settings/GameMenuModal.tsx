"use client";

import { useState, type FormEvent } from "react";
import type { Language } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

type MenuView = "menu" | "settings" | "hotkeys" | "email" | "password";
type HotkeyId =
  | "moveUp"
  | "moveLeft"
  | "moveDown"
  | "moveRight"
  | "inventory"
  | "characterStats"
  | "gameMenu";
type HotkeyCode =
  | "KeyW"
  | "KeyA"
  | "KeyS"
  | "KeyD"
  | "KeyI"
  | "KeyC"
  | "KeyM"
  | "ArrowUp"
  | "ArrowLeft"
  | "ArrowDown"
  | "ArrowRight"
  | "Escape";

interface GameMenuModalProps {
  onClose: () => void;
  onChangeCharacter?: () => void;
  onLogout?: () => void | Promise<void>;
  onChangeEmail?: (email: string) => void;
  onChangePassword?: (currentPassword: string, newPassword: string) => void;
  onChangeLanguage?: (language: Language) => void;
  diagonalWalking?: boolean;
  onDiagonalWalkingChange?: (enabled: boolean) => void;
  languageSaving?: boolean;
  languageError?: boolean;
  initialView?: MenuView;
}

interface HotkeyOption {
  value: HotkeyCode;
  label: string;
}

interface HotkeyRow {
  id: HotkeyId;
  label: string;
}

const DEFAULT_HOTKEYS: Readonly<Record<HotkeyId, HotkeyCode>> = {
  moveUp: "KeyW",
  moveLeft: "KeyA",
  moveDown: "KeyS",
  moveRight: "KeyD",
  inventory: "KeyI",
  characterStats: "KeyC",
  gameMenu: "Escape",
};

export function GameMenuModal({
  onClose,
  onChangeCharacter,
  onLogout,
  onChangeEmail,
  onChangePassword,
  onChangeLanguage,
  diagonalWalking = true,
  onDiagonalWalkingChange,
  languageSaving = false,
  languageError = false,
  initialView = "menu",
}: GameMenuModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const [view, setView] = useState<MenuView>(initialView);
  const [hotkeys, setHotkeys] = useState(DEFAULT_HOTKEYS);
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const languageOptions: ReadonlyArray<{ value: Language; label: string }> = [
    { value: "en", label: t("languages.en") },
    { value: "pt-BR", label: t("languages.pt-BR") },
  ];
  const hotkeyOptions: ReadonlyArray<HotkeyOption> = [
    { value: "KeyW", label: "W" },
    { value: "KeyA", label: "A" },
    { value: "KeyS", label: "S" },
    { value: "KeyD", label: "D" },
    { value: "KeyI", label: "I" },
    { value: "KeyC", label: "C" },
    { value: "KeyM", label: "M" },
    { value: "ArrowUp", label: t("hotkeys.arrowUp") },
    { value: "ArrowLeft", label: t("hotkeys.arrowLeft") },
    { value: "ArrowDown", label: t("hotkeys.arrowDown") },
    { value: "ArrowRight", label: t("hotkeys.arrowRight") },
    { value: "Escape", label: t("hotkeys.escape") },
  ];
  const hotkeyRows: ReadonlyArray<HotkeyRow> = [
    { id: "moveUp", label: t("hotkeys.moveUp") },
    { id: "moveLeft", label: t("hotkeys.moveLeft") },
    { id: "moveDown", label: t("hotkeys.moveDown") },
    { id: "moveRight", label: t("hotkeys.moveRight") },
    { id: "inventory", label: t("hotkeys.inventory") },
    { id: "characterStats", label: t("hotkeys.characterStats") },
    { id: "gameMenu", label: t("hotkeys.gameMenu") },
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
    <Modal title={viewTitles[view]} onClose={onClose}>
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
          <p className="mt-2 text-center text-[10px] tracking-wider text-ui-muted uppercase">
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
            <p className="text-xs text-ui-muted">{t("languages.saving")}</p>
          )}
          {languageError && (
            <p role="alert" className="text-xs text-red-200">
              {t("languages.saveFailed")}
            </p>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-[10px] font-bold tracking-widest text-ui-gold uppercase">
              {t("settings.controls")}
            </h3>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-ui-stone-light/15 bg-black/20 px-3 py-3 has-disabled:cursor-not-allowed has-disabled:opacity-45">
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium text-ui-text">
                  {t("settings.diagonalWalking")}
                </span>
                <span className="text-xs leading-5 text-ui-muted">
                  {t("settings.diagonalWalkingDescription")}
                </span>
              </span>
              <input
                type="checkbox"
                checked={diagonalWalking}
                disabled={!onDiagonalWalkingChange}
                onChange={(event) =>
                  onDiagonalWalkingChange?.(event.currentTarget.checked)
                }
                className="size-4 shrink-0 accent-ui-accent-light"
              />
            </label>
          </section>

          <Button className="w-full" onClick={() => setView("hotkeys")}>
            {t("settings.hotkeyMapping")}
          </Button>

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-[10px] font-bold tracking-widest text-ui-gold uppercase">
              {t("settings.account")}
            </h3>
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
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-lg border border-ui-stone-light/15 bg-black/20">
            {hotkeyRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-4 border-b border-ui-stone-light/10 px-3 py-2.5 last:border-b-0"
              >
                <span className="text-xs font-medium text-ui-text">
                  {row.label}
                </span>
                <Dropdown
                  ariaLabel={t("hotkeys.inputLabel", { action: row.label })}
                  value={hotkeys[row.id]}
                  options={hotkeyOptions}
                  onChange={(value) => {
                    setHotkeys((current) => ({
                      ...current,
                      [row.id]: value,
                    }));
                  }}
                  className="min-w-32"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-2">
            <Button size="sm" onClick={() => setView("settings")}>
              ‹ {t("common.back")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setHotkeys(DEFAULT_HOTKEYS)}
            >
              {t("hotkeys.resetDefaults")}
            </Button>
          </div>
          <p className="text-[10px] leading-4 text-ui-muted">
            {t("hotkeys.previewNotice")}
          </p>
        </div>
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
