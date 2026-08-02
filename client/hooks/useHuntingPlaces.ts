"use client";

import { useEffect, useState } from "react";
import type { HuntingPlace } from "../lib/hunt-finder/HuntingPlace";
import { parseHuntingPlaces } from "../lib/hunt-finder/parseHuntingPlaces";

interface HuntingPlacesState {
  readonly places: ReadonlyArray<HuntingPlace>;
  readonly pending: boolean;
  readonly error: boolean;
}

const INITIAL_STATE: HuntingPlacesState = {
  places: [],
  pending: true,
  error: false,
};

export function useHuntingPlaces(): HuntingPlacesState {
  const [state, setState] = useState<HuntingPlacesState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    // The /assets/* cache policy is tuned for sprite atlases (fresh for a
    // day); this catalog is hand-edited data, so always revalidate — an
    // unchanged file still answers with a cheap 304.
    void fetch("/assets/hunting/hunting_places.json", {
      signal: controller.signal,
      cache: "no-cache",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`hunting place catalog ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((value) => {
        setState({
          places: parseHuntingPlaces(value),
          pending: false,
          error: false,
        });
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({ places: [], pending: false, error: true });
      });
    return () => controller.abort();
  }, []);

  return state;
}
