"use client";

import { useState } from "react";
import {
  PARTY_FINDER_LIMITS,
  type PartyFinderListingMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";

interface PartyFinderSectionProps {
  listing: PartyFinderListingMessage | null;
  isLeader: boolean;
  onAdvertise: (title: string) => void;
  onClearAdvert: () => void;
  onSearch: (forOwnLevel: boolean) => void;
}

/**
 * Renders the server's finder listing. Every row is exactly what the server
 * chose to publish; the client neither filters nor widens it. Browsing is
 * read-only — joining still goes through the leader's invite.
 */
export function PartyFinderSection({
  listing,
  isLeader,
  onAdvertise,
  onClearAdvert,
  onSearch,
}: PartyFinderSectionProps) {
  const { t } = useAppTranslation();
  const [title, setTitle] = useState("");
  const [forOwnLevel, setForOwnLevel] = useState(true);

  return (
    <section className="mt-5 rounded-xl border border-ui-gold/15 bg-black/20 p-3">
      <h3 className="font-display text-sm tracking-[0.15em] text-ui-gold uppercase">
        {t("party.finder.title")}
      </h3>

      {isLeader && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = title.trim();
            if (trimmed.length === 0) return;
            onAdvertise(trimmed);
            setTitle("");
          }}
        >
          <Input
            aria-label={t("party.finder.advertPlaceholder")}
            placeholder={t("party.finder.advertPlaceholder")}
            value={title}
            maxLength={PARTY_FINDER_LIMITS.maxTitleLength}
            onChange={(event) => setTitle(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button size="sm" type="submit">
            {t("party.finder.advertise")}
          </Button>
          <Button size="sm" variant="secondary" onClick={onClearAdvert}>
            {t("party.finder.clearAdvert")}
          </Button>
        </form>
      )}

      <div className="mt-3 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ui-muted">
          <Checkbox
            checked={forOwnLevel}
            aria-label={t("party.finder.myLevelOnly")}
            onChange={(event) => setForOwnLevel(event.target.checked)}
          />
          {t("party.finder.myLevelOnly")}
        </label>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => onSearch(forOwnLevel)}
        >
          {t("party.finder.search")}
        </Button>
      </div>

      {listing && (
        <>
          {listing.entries.length === 0 ? (
            <p className="mt-3 text-sm text-ui-muted">
              {t("party.finder.noResults")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {listing.entries.map((entry) => (
                <li
                  key={entry.partyId}
                  className="flex items-center gap-3 rounded-lg border border-ui-gold/10 bg-black/25 p-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui-text">
                      {entry.title}
                    </span>
                    <span className="block truncate text-ui-muted">
                      {t("party.finder.entryMeta", {
                        leader: entry.leaderName,
                        count: entry.memberCount,
                      })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {listing.truncated && (
            <p className="mt-2 text-sm text-ui-muted">
              {t("party.finder.truncated")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
