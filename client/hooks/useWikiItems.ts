"use client";

import { useEffect, useState } from "react";
import type { WikiItem } from "../lib/wiki/WikiItem";
import { parseWikiItemCatalog } from "../lib/wiki/parseWikiItemCatalog";

interface WikiItemsState {
  readonly items: ReadonlyArray<WikiItem>;
  readonly pending: boolean;
  readonly error: boolean;
}

const INITIAL_STATE: WikiItemsState = {
  items: [],
  pending: true,
  error: false,
};

export function useWikiItems(): WikiItemsState {
  const [state, setState] = useState<WikiItemsState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/assets/wiki-items.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`wiki item catalog ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((value) => {
        setState({ items: parseWikiItemCatalog(value), pending: false, error: false });
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({ items: [], pending: false, error: true });
      });
    return () => controller.abort();
  }, []);

  return state;
}
