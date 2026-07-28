"use client";

import { useEffect, useState } from "react";

const MAX_ENTRIES = 2_000;

function parseSprites(value: unknown): ReadonlyMap<number, number> {
  if (
    value === null ||
    typeof value !== "object" ||
    (value as { formatVersion?: unknown }).formatVersion !== 1
  ) {
    throw new Error("invalid proficiency sprites asset");
  }
  const sprites = (value as { sprites?: unknown }).sprites;
  if (sprites === null || typeof sprites !== "object" || Array.isArray(sprites)) {
    throw new Error("invalid proficiency sprites asset");
  }
  const entries = Object.entries(sprites as Record<string, unknown>);
  if (entries.length > MAX_ENTRIES) {
    throw new Error("invalid proficiency sprites asset");
  }
  const map = new Map<number, number>();
  for (const [key, spriteId] of entries) {
    const proficiencyId = Number(key);
    if (
      !Number.isInteger(proficiencyId) ||
      proficiencyId < 1 ||
      !Number.isInteger(spriteId) ||
      Number(spriteId) < 1
    ) {
      throw new Error("invalid proficiency sprites asset");
    }
    map.set(proficiencyId, Number(spriteId));
  }
  return map;
}

/** Loads the proficiencyId→spriteId asset for the proficiency window. */
export function useProficiencySprites(): ReadonlyMap<number, number> {
  const [sprites, setSprites] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/assets/proficiency-sprites.json", {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`proficiency sprites ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((value) => setSprites(parseSprites(value)))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        // Sprites are decoration; the window still works without them.
      });
    return () => controller.abort();
  }, []);

  return sprites;
}
