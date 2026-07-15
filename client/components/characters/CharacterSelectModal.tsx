"use client";

import { useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { CharacterListItem } from "./CharacterListItem";
import { CreateCharacterForm } from "./CreateCharacterForm";
import type { CharacterSummary, Vocation } from "./characterTypes";

type CharacterModalView = "select" | "create";

interface CharacterSelectModalProps {
  characters: ReadonlyArray<CharacterSummary>;
  onClose: () => void;
  onSelectCharacter: (characterId: string) => void;
  onCreateCharacter: (name: string, vocation: Vocation) => void;
  maxCharacters?: number;
  busy?: boolean;
  error?: string | null;
  initialView?: CharacterModalView;
}

export function CharacterSelectModal({
  characters,
  onClose,
  onSelectCharacter,
  onCreateCharacter,
  maxCharacters = 5,
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

  const atCapacity = characters.length >= maxCharacters;

  return (
    <Modal
      title={
        view === "select"
          ? t("characters.selectTitle")
          : t("characters.createTitle")
      }
      onClose={onClose}
      footer={
        view === "select" ? (
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
              disabled={busy || !selectedId}
              onClick={() => {
                if (selectedId) onSelectCharacter(selectedId);
              }}
            >
              {busy && (
                <span
                  aria-hidden
                  className="size-3 rotate-45 border border-current border-t-transparent motion-safe:animate-spin"
                />
              )}
              {busy ? t("characters.entering") : t("characters.enterWorld")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {view === "select" ? (
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
                  />
                ))}
              </div>
            )}
            <p className="text-center text-[10px] tracking-wider text-ui-muted uppercase">
              {t("characters.slotsUsed", {
                count: characters.length,
                max: maxCharacters,
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
