"use client";

import { useState } from "react";
import type {
  AccountTier,
  CharacterCreationOptions,
  CharacterSummary,
  CreateCharacterInput,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { ConnectionStatus } from "../../lib/net/GameClient";
import { Button } from "../ui/Button";
import { CharacterSelectModal } from "./CharacterSelectModal";

interface CharacterSelectScreenProps {
  status: ConnectionStatus;
  characters: ReadonlyArray<CharacterSummary> | null;
  creationOptions: CharacterCreationOptions | null;
  accountTier: AccountTier;
  premiumDaysRemaining: number;
  busy: boolean;
  error: string | null;
  onCreate: (input: CreateCharacterInput) => void;
  onSelect: (characterId: string) => void;
  onReconnect: () => void;
  onLogout: () => void | Promise<void>;
}

export function CharacterSelectScreen({
  status,
  characters,
  creationOptions,
  accountTier,
  premiumDaysRemaining,
  busy,
  error,
  onCreate,
  onSelect,
  onReconnect,
  onLogout,
}: CharacterSelectScreenProps) {
  const { t } = useAppTranslation();
  const [logoutFailed, setLogoutFailed] = useState(false);

  const logout = () => {
    setLogoutFailed(false);
    void Promise.resolve(onLogout()).catch(() => setLogoutFailed(true));
  };

  if (!characters || !creationOptions) {
    const message =
      status === "disconnected"
        ? t("connection.disconnected")
        : t("characters.loading");
    return (
      <div className="ui-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 font-tibia text-ui-text">
        <div className="ui-panel-frame relative flex max-w-md flex-col gap-4 px-6 py-5 text-center text-sm text-ui-accent-light">
          <p role={status === "disconnected" ? "alert" : "status"}>
            {logoutFailed ? t("menu.logoutFailed") : message}
          </p>
          {status === "disconnected" && (
            <div className="flex justify-center gap-2">
              <Button variant="primary" onClick={onReconnect}>
                {t("connection.reconnect")}
              </Button>
              <Button onClick={logout}>{t("menu.logout")}</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <CharacterSelectModal
      key={characters.map((character) => character.id).join(":")}
      characters={characters}
      creationOptions={creationOptions}
      accountTier={accountTier}
      premiumDaysRemaining={premiumDaysRemaining}
      busy={busy}
      error={logoutFailed ? t("menu.logoutFailed") : error}
      onClose={logout}
      onCreateCharacter={onCreate}
      onSelectCharacter={onSelect}
    />
  );
}
