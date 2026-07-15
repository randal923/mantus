"use client";

import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { RangeSlider } from "../ui/RangeSlider";

type MenuView = "menu" | "settings" | "hotkeys" | "email" | "password";
type Language = "en" | "pt-BR";
type HotkeyId =
  | "moveUp"
  | "moveLeft"
  | "moveDown"
  | "moveRight"
  | "inventory"
  | "gameMenu";
type HotkeyCode =
  | "KeyW"
  | "KeyA"
  | "KeyS"
  | "KeyD"
  | "KeyI"
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

const HOTKEY_OPTIONS: ReadonlyArray<HotkeyOption> = [
  { value: "KeyW", label: "W" },
  { value: "KeyA", label: "A" },
  { value: "KeyS", label: "S" },
  { value: "KeyD", label: "D" },
  { value: "KeyI", label: "I" },
  { value: "KeyM", label: "M" },
  { value: "ArrowUp", label: "Arrow Up" },
  { value: "ArrowLeft", label: "Arrow Left" },
  { value: "ArrowDown", label: "Arrow Down" },
  { value: "ArrowRight", label: "Arrow Right" },
  { value: "Escape", label: "Escape" },
];

const LANGUAGE_OPTIONS: ReadonlyArray<{ value: Language; label: string }> = [
  { value: "en", label: "English" },
  { value: "pt-BR", label: "Português" },
];

const HOTKEY_ROWS: ReadonlyArray<HotkeyRow> = [
  { id: "moveUp", label: "Move Up" },
  { id: "moveLeft", label: "Move Left" },
  { id: "moveDown", label: "Move Down" },
  { id: "moveRight", label: "Move Right" },
  { id: "inventory", label: "Inventory" },
  { id: "gameMenu", label: "Game Menu" },
];

const DEFAULT_HOTKEYS: Readonly<Record<HotkeyId, HotkeyCode>> = {
  moveUp: "KeyW",
  moveLeft: "KeyA",
  moveDown: "KeyS",
  moveRight: "KeyD",
  inventory: "KeyI",
  gameMenu: "Escape",
};

const VIEW_TITLES: Readonly<Record<MenuView, string>> = {
  menu: "Game Menu",
  settings: "Settings",
  hotkeys: "Hotkey Mapping",
  email: "Change Email",
  password: "Change Password",
};

export function GameMenuModal({
  onClose,
  onChangeCharacter,
  onLogout,
  onChangeEmail,
  onChangePassword,
  initialView = "menu",
}: GameMenuModalProps) {
  const [view, setView] = useState<MenuView>(initialView);
  const [language, setLanguage] = useState<Language>("en");
  const [volume, setVolume] = useState(65);
  const [hotkeys, setHotkeys] = useState(DEFAULT_HOTKEYS);
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const logout = async () => {
    if (!onLogout) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await onLogout();
      onClose();
    } catch {
      setActionError("Logout failed. Please try again.");
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
    <Modal title={VIEW_TITLES[view]} onClose={onClose}>
      {view === "menu" && (
        <nav aria-label="Game menu actions" className="flex flex-col gap-2">
          <Button
            variant="primary"
            className="w-full justify-between"
            onClick={() => setView("settings")}
          >
            Settings
            <span aria-hidden>›</span>
          </Button>
          <Button
            className="w-full"
            disabled={!onChangeCharacter}
            onClick={onChangeCharacter}
          >
            Change Character
          </Button>
          <Button
            variant="danger"
            className="w-full"
            disabled={!onLogout || actionBusy}
            onClick={() => void logout()}
          >
            {actionBusy ? "Logging Out" : "Logout"}
          </Button>
          {actionError && (
            <p role="alert" className="border-l-2 border-ui-accent bg-ui-accent/10 px-3 py-2 text-sm text-red-200">
              {actionError}
            </p>
          )}
          <p className="mt-2 text-center text-[10px] tracking-wider text-ui-muted uppercase">
            Press Esc to return to the game
          </p>
        </nav>
      )}

      {view === "settings" && (
        <div className="flex flex-col gap-5">
          <Dropdown
            ariaLabel="Language"
            label="Language"
            value={language}
            options={LANGUAGE_OPTIONS}
            onChange={setLanguage}
          />

          <RangeSlider
            label="Master Volume"
            value={volume}
            min={0}
            max={100}
            unit="%"
            onChange={setVolume}
          />

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-[10px] font-bold tracking-widest text-ui-gold uppercase">
              Controls
            </h3>
            <Button className="w-full" onClick={() => setView("hotkeys")}>
              Hotkey Mapping
            </Button>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-[10px] font-bold tracking-widest text-ui-gold uppercase">
              Account
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={() => setView("email")}>
                Change Email
              </Button>
              <Button size="sm" onClick={() => setView("password")}>
                Change Password
              </Button>
            </div>
          </section>

          <Button size="sm" className="self-start" onClick={() => setView("menu")}>
            ‹ Back
          </Button>
          <p className="text-[10px] leading-4 text-ui-muted">
            Language, volume, and hotkeys are preview-only until settings persistence is connected.
          </p>
        </div>
      )}

      {view === "hotkeys" && (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-lg border border-ui-stone-light/15 bg-black/20">
            {HOTKEY_ROWS.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-4 border-b border-ui-stone-light/10 px-3 py-2.5 last:border-b-0"
              >
                <span className="text-xs font-medium text-ui-text">{row.label}</span>
                <Dropdown
                  ariaLabel={`${row.label} hotkey`}
                  value={hotkeys[row.id]}
                  options={HOTKEY_OPTIONS}
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
              ‹ Back
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setHotkeys(DEFAULT_HOTKEYS)}
            >
              Reset Defaults
            </Button>
          </div>
          <p className="text-[10px] leading-4 text-ui-muted">
            These mappings are local to this preview and do not change runtime controls yet.
          </p>
        </div>
      )}

      {view === "email" && (
        <form onSubmit={submitEmail} className="flex flex-col gap-4">
          <Input
            label="New Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setView("settings")}>
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              variant="primary"
              disabled={!onChangeEmail}
            >
              Update Email
            </Button>
          </div>
        </form>
      )}

      {view === "password" && (
        <form onSubmit={submitPassword} className="flex flex-col gap-4">
          <Input
            label="Current Password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
          />
          <Input
            label="New Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.currentTarget.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setView("settings")}>
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              variant="primary"
              disabled={!onChangePassword}
            >
              Update Password
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
