"use client";

import { useState } from "react";
import { HOUSE_LIMITS, type HouseListKind, type HouseState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface HouseTextListSectionProps {
  house: HouseState;
  pending: boolean;
  onSetList: (kind: HouseListKind, body: string) => void;
}

/**
 * Editor for the two house-wide Canary text access lists. The body is sent
 * verbatim; the server bounds, parses, and evaluates it, and per-door lists
 * are edited from the door itself rather than here.
 */
export function HouseTextListSection({
  house,
  pending,
  onSetList,
}: HouseTextListSectionProps) {
  const { t } = useAppTranslation();
  const bodyFor = (kind: HouseListKind) =>
    house.textLists?.find((list) => list.kind === kind)?.body ?? "";
  const [kind, setKind] = useState<HouseListKind>("guest");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const body = drafts[kind] ?? bodyFor(kind);
  const kinds: ReadonlyArray<HouseListKind> = ["guest", "subowner"];
  const doorLists = house.textLists?.filter((list) => list.kind === "door") ?? [];

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-button text-sm uppercase tracking-wide text-ui-muted">
        {t("house.textLists.title")}
      </h3>
      <p className="text-xs text-ui-muted">{t("house.textLists.help")}</p>
      <div className="flex gap-1 self-start rounded-lg border border-ui-gold/10 bg-black/20 p-1">
        {kinds.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setKind(candidate)}
            className={`rounded-md px-3 py-1 font-button text-xs uppercase tracking-wide transition-colors ${
              kind === candidate
                ? "bg-ui-accent/25 text-ui-text-bright"
                : "text-ui-muted hover:text-ui-text"
            }`}
          >
            {t(`house.accessLists.${candidate}`)}
          </button>
        ))}
      </div>
      <textarea
        rows={6}
        maxLength={HOUSE_LIMITS.maxAccessListLength}
        value={body}
        aria-label={t("house.textLists.title")}
        onChange={(event) =>
          setDrafts((current) => ({ ...current, [kind]: event.target.value }))
        }
        className="w-full rounded-md border border-ui-gold/20 bg-black/30 px-2 py-1 font-mono text-sm text-ui-text-bright"
      />
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          disabled={pending}
          onClick={() => onSetList(kind, body)}
        >
          {t("house.textLists.save")}
        </Button>
        {doorLists.length > 0 && (
          <span className="text-xs text-ui-muted">
            {t("house.textLists.doorCount", { count: doorLists.length })}
          </span>
        )}
      </div>
    </section>
  );
}
