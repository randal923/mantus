"use client";

import { useEffect, useState } from "react";
import type { LootFilterItem } from "@tibia/protocol";
import { parseCreatureLootCatalog } from "../lib/loot-filter/parseCreatureLootCatalog";

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

/** Every item any creature in the game can drop, for the loot-filter search. */
export function useCreatureLootItems(): CreatureLootItemsState {
  const [state, setState] = useState<CreatureLootItemsState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/assets/creature-loot-items.json", {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`creature loot catalog ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((value) => {
        setState({
          items: parseCreatureLootCatalog(value),
          pending: false,
          error: false,
        });
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({ items: [], pending: false, error: true });
      });
    return () => controller.abort();
  }, []);

  return state;
}
