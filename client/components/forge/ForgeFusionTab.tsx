"use client";

import { useState } from "react";
import {
  FORGE_RULES,
  FORGE_TIER_PRICES,
  type ForgeFusionMessage,
  type InventoryState,
} from "@tibia/protocol";
import { collectFusionPairs } from "../../lib/forge/collectFusionPairs";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { ForgeCostSummary } from "./ForgeCostSummary";

interface ForgeFusionTabProps {
  inventory: InventoryState;
  pending: boolean;
  onFusion: (intent: Omit<ForgeFusionMessage, "type">) => void;
}

/**
 * Fusion: pick two identical carried items of one tier. Costs and success
 * chance come from the shared protocol tables; the server rolls everything.
 */
export function ForgeFusionTab({
  inventory,
  pending,
  onFusion,
}: ForgeFusionTabProps) {
  const { t } = useAppTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [usedCore, setUsedCore] = useState(false);
  const [reduceTierLoss, setReduceTierLoss] = useState(false);
  const [convergence, setConvergence] = useState(false);
  const pairs = collectFusionPairs(inventory);
  const selected = pairs.find((pair) => pair.key === selectedKey) ?? null;
  const targetTier = selected ? selected.tier + 1 : 0;
  const prices = selected
    ? FORGE_TIER_PRICES[selected.classification]?.[targetTier]
    : undefined;
  const convergible =
    selected?.classification === 4 &&
    (prices?.convergenceFusionPrice ?? 0) > 0;
  const effectiveConvergence = convergence && convergible;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ui-muted">{t("forge.fusion.hint")}</p>

      {pairs.length === 0 && (
        <p className="py-8 text-center text-sm text-ui-muted">
          {t("forge.fusion.noPairs")}
        </p>
      )}

      {pairs.length > 0 && (
        <ul className="ui-scrollbar grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {pairs.map((pair) => (
            <li key={pair.key}>
              <button
                type="button"
                onClick={() =>
                  setSelectedKey((current) =>
                    current === pair.key ? null : pair.key,
                  )
                }
                className={`flex w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-[border-color,background-color] ${
                  selectedKey === pair.key
                    ? "border-ui-gold/60 bg-ui-gold/10"
                    : "border-ui-stone-light/15 bg-black/25 hover:border-ui-gold/40"
                }`}
              >
                <SpriteIcon
                  spriteId={pair.item.spriteId}
                  clientId={pair.item.clientId}
                  scale={1.25}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ui-text-bright capitalize">
                    {pair.item.name}
                  </span>
                  <span className="block text-xs text-ui-muted">
                    {t("forge.tier", { tier: pair.tier })} ·{" "}
                    {t("forge.fusion.carried", { owned: pair.count })}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ui-gold">
                  {t("forge.fusion.target", { tier: pair.tier + 1 })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && prices && (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Checkbox
              checked={usedCore && !effectiveConvergence}
              disabled={pending || effectiveConvergence}
              onChange={(event) => setUsedCore(event.target.checked)}
              label={t("forge.fusion.useCore", {
                percent: FORGE_RULES.coreSuccessPercent,
              })}
            />
            <Checkbox
              checked={reduceTierLoss && !effectiveConvergence}
              disabled={pending || effectiveConvergence}
              onChange={(event) => setReduceTierLoss(event.target.checked)}
              label={t("forge.fusion.reduceTierLoss")}
            />
            {convergible && (
              <Checkbox
                checked={convergence}
                disabled={pending}
                onChange={(event) => setConvergence(event.target.checked)}
                label={t("forge.convergence")}
              />
            )}
          </div>
          <ForgeCostSummary
            goldCost={
              effectiveConvergence
                ? prices.convergenceFusionPrice
                : prices.regularPrice
            }
            dustCost={
              effectiveConvergence
                ? FORGE_RULES.convergenceFusionDustCost
                : FORGE_RULES.fusionDustCost
            }
            coreCost={
              effectiveConvergence
                ? 0
                : (usedCore ? 1 : 0) + (reduceTierLoss ? 1 : 0)
            }
            successPercent={
              effectiveConvergence
                ? 100
                : FORGE_RULES.baseSuccessPercent +
                  (usedCore ? FORGE_RULES.coreSuccessPercent : 0)
            }
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                onFusion({
                  firstItemId: selected.firstItemId,
                  secondItemId: selected.secondItemId,
                  usedCore: usedCore && !effectiveConvergence,
                  reduceTierLoss: reduceTierLoss && !effectiveConvergence,
                  convergence: effectiveConvergence,
                })
              }
            >
              {t("forge.fusion.submit")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
