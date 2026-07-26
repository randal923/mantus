"use client";

import { useEffect, useState } from "react";
import type { ProficiencyProfile } from "../lib/proficiency/ProficiencyProfile";
import { parseProficiencyCatalog } from "../lib/proficiency/parseProficiencyCatalog";

interface ProficiencyCatalogState {
  readonly profiles: ReadonlyArray<ProficiencyProfile>;
  readonly pending: boolean;
  readonly error: boolean;
}

const INITIAL_STATE: ProficiencyCatalogState = {
  profiles: [],
  pending: true,
  error: false,
};

/** Loads the static perk-table asset; progress still comes from the server. */
export function useProficiencyCatalog(): ProficiencyCatalogState {
  const [state, setState] = useState<ProficiencyCatalogState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/assets/proficiencies.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`proficiency catalog ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((value) => {
        setState({
          profiles: parseProficiencyCatalog(value),
          pending: false,
          error: false,
        });
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({ profiles: [], pending: false, error: true });
      });
    return () => controller.abort();
  }, []);

  return state;
}
