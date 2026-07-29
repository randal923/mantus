import { LEGACY_FRAME_DURATION_MS } from "./LEGACY_FRAME_DURATION_MS";
import type { SpriteSequence } from "./resolveSpriteFrame";
import { resolveSpriteFrame } from "./resolveSpriteFrame";

interface ItemAnimationEntry {
  /** Sprite drawn by the first frame; what a bare sprite id resolves against. */
  b: number;
  /** Frame count for a consecutive run from `b`, or the explicit sprite ids. */
  f: number | number[];
  /** One duration for every frame, or a duration per frame. */
  d: number | number[];
}

interface ItemAnimationsFile {
  fallbackDurationMs?: number;
  animations: Record<string, ItemAnimationEntry>;
}

const ASSET_URL = "/assets/item-animations.json";
/** Never wake more often than one display frame, whatever the table says. */
const MINIMUM_WAKE_MS = 16;

let byClientId: Map<number, SpriteSequence> | null = null;
/**
 * First-frame sprite → sequence, for icons that only receive a sprite id. A
 * handful of appearances share a first sprite but disagree on the rest; those
 * sprites resolve to nothing here so no icon ever animates into another item's
 * art — callers that pass a client id are not affected.
 */
let bySpriteId: Map<number, SpriteSequence | null> | null = null;
let loading: Promise<void> | null = null;
let epochMs = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

interface IconKey {
  clientId?: number;
  spriteId: number;
}

/** Every mounted icon, mapped to the sequence it plays (null while static). */
const listeners = new Map<() => void, IconKey>();
/** The frame each animated sequence shows now; the snapshot React reads. */
const currentFrames = new Map<SpriteSequence, number>();

function sequenceFor(key: IconKey): SpriteSequence | undefined {
  if (key.clientId !== undefined) {
    const sequence = byClientId?.get(key.clientId);
    if (sequence) return sequence;
    return undefined;
  }
  return bySpriteId?.get(key.spriteId) ?? undefined;
}

function toSequence(
  entry: ItemAnimationEntry,
  fallbackDurationMs: number,
): SpriteSequence | null {
  const frames =
    typeof entry.f === "number"
      ? Array.from({ length: entry.f }, (_, index) => entry.b + index)
      : entry.f;
  if (frames.length < 2) return null;
  const durations = frames.map((_, index) => {
    const duration = typeof entry.d === "number" ? entry.d : entry.d[index];
    return Number.isFinite(duration) && duration > 0 ? duration : fallbackDurationMs;
  });
  const cycleMs = durations.reduce((total, duration) => total + duration, 0);
  if (cycleMs <= 0) return null;
  return { frames, durations, cycleMs };
}

function advance(): void {
  timer = null;
  const elapsed = Date.now() - epochMs;
  const changed = new Set<SpriteSequence>();
  let nextWakeMs = Number.POSITIVE_INFINITY;
  const active = new Set<SpriteSequence>();
  for (const key of listeners.values()) {
    const sequence = sequenceFor(key);
    if (sequence) active.add(sequence);
  }
  for (const sequence of active) {
    const frame = resolveSpriteFrame(sequence, elapsed);
    if (currentFrames.get(sequence) !== frame.spriteId) {
      currentFrames.set(sequence, frame.spriteId);
      changed.add(sequence);
    }
    nextWakeMs = Math.min(nextWakeMs, frame.remainingMs);
  }
  for (const [listener, key] of listeners) {
    const sequence = sequenceFor(key);
    if (sequence && changed.has(sequence)) listener();
  }
  if (Number.isFinite(nextWakeMs)) {
    timer = setTimeout(advance, Math.max(MINIMUM_WAKE_MS, nextWakeMs));
  }
}

function hasAnimatedListener(): boolean {
  for (const key of listeners.values()) {
    if (sequenceFor(key)) return true;
  }
  return false;
}

function stopClock(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Picks up a newly mounted icon's frame and re-aims the next wake at it. */
function restartClock(): void {
  stopClock();
  if (hasAnimatedListener()) advance();
}

function load(): void {
  if (loading || byClientId) return;
  epochMs = Date.now();
  loading = fetch(ASSET_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((file: ItemAnimationsFile | null) => {
      if (!file) return;
      const fallback = file.fallbackDurationMs || LEGACY_FRAME_DURATION_MS;
      byClientId = new Map();
      bySpriteId = new Map();
      for (const [clientId, entry] of Object.entries(file.animations)) {
        const sequence = toSequence(entry, fallback);
        if (!sequence) continue;
        byClientId.set(Number(clientId), sequence);
        const existing = bySpriteId.get(entry.b);
        if (existing === undefined) {
          bySpriteId.set(entry.b, sequence);
        } else if (
          existing === null ||
          JSON.stringify(existing) !== JSON.stringify(sequence)
        ) {
          bySpriteId.set(entry.b, null);
        }
      }
      restartClock();
    })
    // Icons stay on their first frame if the table cannot be fetched; an
    // animation is decoration and must never break the inventory.
    .catch(() => undefined);
}

/**
 * The sprite frames Tibia gives each animated item and how long it holds each
 * one, shared by every DOM item icon so they all advance on one clock (the
 * world renderer keeps its own per-instance phases). The clock sleeps until the
 * next frame boundary of a mounted icon, so idle-then-glint items cost nothing
 * while they idle.
 */
export const itemSpriteAnimationStore = {
  subscribe(key: IconKey, listener: () => void): () => void {
    listeners.set(listener, key);
    load();
    restartClock();
    return () => {
      listeners.delete(listener);
      if (!hasAnimatedListener()) stopClock();
    };
  },
  /** The sprite id to draw right now; the input id when it does not animate. */
  currentSpriteId(key: IconKey): number {
    const sequence = sequenceFor(key);
    if (!sequence) return key.spriteId;
    return currentFrames.get(sequence) ?? key.spriteId;
  },
};
