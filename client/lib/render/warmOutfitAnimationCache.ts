import type { CreatureOutfit } from "@tibia/protocol";
import { getOutfitAnimationFrames } from "./getOutfitAnimationFrames";

const queue: CreatureOutfit[] = [];
const queuedKeys = new Set<string>();
let running = false;

/**
 * Bakes outfit walk cycles in the background, one at a time with idle gaps,
 * so scrolling the bestiary hits the memoized cache instead of baking (and
 * fetching atlas sheets) on demand. Safe to call repeatedly; already-queued
 * or already-baked outfits are skipped via the shared memo.
 */
export function warmOutfitAnimationCache(
  outfits: ReadonlyArray<CreatureOutfit>,
): void {
  for (const outfit of outfits) {
    const key = [
      outfit.lookType,
      outfit.head,
      outfit.body,
      outfit.legs,
      outfit.feet,
      outfit.addons,
    ].join(":");
    if (queuedKeys.has(key)) continue;
    queuedKeys.add(key);
    queue.push(outfit);
  }
  if (!running) void drain();
}

async function drain(): Promise<void> {
  running = true;
  while (queue.length > 0) {
    const outfit = queue.shift();
    if (!outfit) break;
    try {
      await getOutfitAnimationFrames(outfit);
    } catch {
      // A missing lookType only affects its own cell; keep warming the rest.
    }
    await idle();
  }
  running = false;
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 200 });
      return;
    }
    setTimeout(resolve, 25);
  });
}
