"use client";

import { useEffect, useState } from "react";
import type { LootFilterItem } from "@tibia/protocol";
import { loadCreatureLootCatalog } from "../lib/loot-filter/loadCreatureLootCatalog";

interface CreatureLootItemsState {
  readonly items: ReadonlyArray<LootFilterItem>;
  readonly pending: boolean;
  readonly error: boolean;
}

const INITIAL_STATE: CreatureLootItemsState = {
  items: [],
  pending: true,
  error: false,
};

/**
 * Every item any creature in the game can drop, for the loot-filter search.
 * The document is parsed once per session and handed out from memory after
 * that, so reopening the window costs nothing.
 */
export function useCreatureLootItems(): CreatureLootItemsState {
  const [state, setState] = useState<CreatureLootItemsState>(INITIAL_STATE);

  useEffect(() => {
    let live = true;
    void loadCreatureLootCatalog()
      .then((items) => {
        if (live) setState({ items, pending: false, error: false });
      })
      .catch(() => {
        if (live) setState({ items: [], pending: false, error: true });
      });
    return () => {
      live = false;
    };
  }, []);

  return state;
}
