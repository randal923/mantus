"use client";

import { useEffect, useState } from "react";

export interface ImbuementBurnClock {
  /** Seconds since the anchor that any worn imbuement burned. */
  readonly passiveSeconds: number;
  /** Of those, the seconds an aggressive category also burned. */
  readonly aggressiveSeconds: number;
}

/**
 * Display-only countdown for the imbuement tracker.
 *
 * The server owns imbuement decay and writes a durable checkpoint every 60
 * qualifying seconds (`ImbuementService`), which pushes a fresh inventory —
 * so the numbers on the wire only move once a minute. Canary papers over that
 * by re-sending the whole tracker roughly once a second while the window is
 * open (player.cpp `updateImbuementTrackerStats`); we count locally instead
 * and re-anchor on `anchorKey`, the inventory revision, the way
 * `OwnSkullIndicator` re-anchors its skull timer. Nothing here is authoritative:
 * a checkpoint that disagrees wins within the minute.
 *
 * Two accumulators, because the two categories burn on different clocks:
 * non-aggressive imbuements burn whenever the piece is worn, aggressive ones
 * only in a fight outside a protection zone.
 */
export function useImbuementBurnClock(
  anchorKey: number,
  aggressiveBurning: boolean,
): ImbuementBurnClock {
  const [clock, setClock] = useState({
    anchorKey,
    passiveSeconds: 0,
    aggressiveSeconds: 0,
  });
  if (clock.anchorKey !== anchorKey) {
    setClock({ anchorKey, passiveSeconds: 0, aggressiveSeconds: 0 });
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setClock((current) => ({
        anchorKey: current.anchorKey,
        passiveSeconds: current.passiveSeconds + 1,
        aggressiveSeconds:
          current.aggressiveSeconds + (aggressiveBurning ? 1 : 0),
      }));
    }, 1_000);
    return () => clearInterval(timer);
  }, [aggressiveBurning]);

  return {
    passiveSeconds: clock.passiveSeconds,
    aggressiveSeconds: clock.aggressiveSeconds,
  };
}
