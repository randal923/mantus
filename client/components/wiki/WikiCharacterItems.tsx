"use client";

import { useMemo } from "react";
import type { CyclopediaItemSummaryStateMessage } from "@tibia/protocol";
import { useWikiItems } from "../../hooks/useWikiItems";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { WikiItem } from "../../lib/wiki/WikiItem";
import { WikiCharacterItemSection } from "./WikiCharacterItemSection";

interface WikiCharacterItemsProps {
  itemSummary: CyclopediaItemSummaryStateMessage | null;
  pending: boolean;
}

/** Own items grouped by storage area, exactly as the server summarized them. */
export function WikiCharacterItems({
  itemSummary,
  pending,
}: WikiCharacterItemsProps) {
  const { t } = useAppTranslation();
  const catalog = useWikiItems();
  const itemsById = useMemo(() => {
    const byId = new Map<number, WikiItem>();
    for (const item of catalog.items) byId.set(item.id, item);
    return byId as ReadonlyMap<number, WikiItem>;
  }, [catalog.items]);

  if (!itemSummary) {
    return (
      <p className="py-12 text-center text-sm text-ui-muted">
        {pending
          ? t("wiki.character.loading")
          : t("wiki.character.items.unavailable")}
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <WikiCharacterItemSection
        title={t("wiki.character.items.carried")}
        entries={itemSummary.carried}
        itemsById={itemsById}
      />
      <WikiCharacterItemSection
        title={t("wiki.character.items.depot")}
        entries={itemSummary.depot}
        itemsById={itemsById}
      />
      <WikiCharacterItemSection
        title={t("wiki.character.items.inbox")}
        entries={itemSummary.inbox}
        itemsById={itemsById}
      />
      <WikiCharacterItemSection
        title={t("wiki.character.items.stash")}
        entries={itemSummary.stash}
        itemsById={itemsById}
      />
    </div>
  );
}
