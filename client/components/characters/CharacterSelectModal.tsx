"use client";

import { useState } from "react";
import type {
  AccountTier,
  CharacterCreationOptions,
  CharacterSummary,
  CreateCharacterInput,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { CharacterListItem } from "./CharacterListItem";
import { CreateCharacterForm } from "./CreateCharacterForm";

type CharacterModalView = "select" | "create" | "delete";

interface CharacterSelectModalProps {
  characters: ReadonlyArray<CharacterSummary>;
  creationOptions: CharacterCreationOptions;
  accountTier: AccountTier;
  premiumDaysRemaining: number;
  onClose: () => void;
  onSelectCharacter: (characterId: string) => void;
  onCreateCharacter: (input: CreateCharacterInput) => void;
  onDeleteCharacter: (characterId: string) => void;
  busy?: boolean;
  error?: string | null;
  initialView?: CharacterModalView;
}

export function CharacterSelectModal({
  characters,
  creationOptions,
  accountTier,
  premiumDaysRemaining,
  onClose,
  onSelectCharacter,
  onCreateCharacter,
  onDeleteCharacter,
  busy = false,
  error,
  initialView,
}: CharacterSelectModalProps) {
  const { t } = useAppTranslation();
  const [view, setView] = useState<CharacterModalView>(
    initialView ?? (characters.length > 0 ? "select" : "create"),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    characters[0]?.id ?? null,
  );

  const atCapacity = characters.length >= creationOptions.maxCharacters;
  const selected =
    characters.find((character) => character.id === selectedId) ?? null;

  return (
    <Modal
      title={
        view === "select"
          ? t("characters.selectTitle")
          : view === "delete"
            ? t("characters.deleteTitle")
            : t("characters.createTitle")
      }
      onClose={onClose}
      height="auto"
      footer={
        view === "delete" && selected ? (
          <>
            <Button disabled={busy} onClick={() => setView("select")}>
              {t("characters.deleteCancel")}
            </Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={() => onDeleteCharacter(selected.id)}
            >
              {busy ? t("characters.deleting") : t("characters.deleteConfirm")}
            </Button>
          </>
        ) : view === "select" ? (
          <>
            <Button
              disabled={busy || atCapacity}
              title={atCapacity ? t("characters.slotsFull") : undefined}
              onClick={() => setView("create")}
            >
              {t("characters.newCharacter")}
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!selectedId}
              onClick={() => {
                if (selectedId) onSelectCharacter(selectedId);
              }}
            >
              {busy ? t("characters.entering") : t("characters.enterWorld")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-lg border border-ui-stone-light/15 bg-black/20 px-3 py-2 text-sm">
          <span className="font-medium text-ui-gold">
            {t(`characters.accountTiers.${accountTier}`)}
          </span>
          {accountTier === "premium" && (
            <span className="text-ui-muted">
              {t("characters.premiumDaysRemaining", {
                count: premiumDaysRemaining,
              })}
            </span>
          )}
        </div>
        {view === "delete" && selected ? (
          <div className="flex flex-col gap-4">
            <CharacterListItem
              character={selected}
              selected
              disabled
              onSelect={() => undefined}
              onConfirm={() => undefined}
            />
            <p
              role="alertdialog"
              aria-live="assertive"
              className="border-l-2 border-ui-accent bg-ui-accent/10 px-3 py-3 text-sm text-red-200"
            >
              <span className="block font-semibold text-ui-text-bright">
                {t("characters.deleteWarning")}
              </span>
              <span className="mt-1 block">
                {t("characters.deleteIrreversible", { name: selected.name })}
              </span>
            </p>
            {error && (
              <p
                role="alert"
                className="border-l-2 border-ui-accent bg-ui-accent/10 px-3 py-2 text-sm text-red-200"
              >
                {error}
              </p>
            )}
          </div>
        ) : view === "select" ? (
          <>
            {characters.length === 0 ? (
              <p className="rounded-lg border border-ui-stone-light/15 bg-black/20 px-4 py-8 text-center text-ui-muted">
                {t("characters.empty")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {characters.map((character) => (
                  <CharacterListItem
                    key={character.id}
                    character={character}
                    selected={character.id === selectedId}
                    disabled={busy}
                    onSelect={() => setSelectedId(character.id)}
                    onConfirm={() => onSelectCharacter(character.id)}
                    onDelete={() => {
                      setSelectedId(character.id);
                      setView("delete");
                    }}
                  />
                ))}
              </div>
            )}
            <p className="text-center text-xs tracking-wider text-ui-muted uppercase">
              {t("characters.slotsUsed", {
                count: characters.length,
                max: creationOptions.maxCharacters,
              })}
            </p>
            {error && (
              <p
                role="alert"
                className="border-l-2 border-ui-accent bg-ui-accent/10 px-3 py-2 text-sm text-red-200"
              >
                {error}
              </p>
            )}
          </>
        ) : (
          <CreateCharacterForm
            creationOptions={creationOptions}
            busy={busy}
            error={error}
            onCancel={
              characters.length > 0 ? () => setView("select") : undefined
            }
            onCreate={onCreateCharacter}
          />
        )}
      </div>
    </Modal>
  );
}
