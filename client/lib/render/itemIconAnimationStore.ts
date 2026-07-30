import type { TibiaObject } from "./AssetStore";
import { getItemAnimationSchedule } from "./getItemAnimationSchedule";
import { getSharedAssetStore } from "./getSharedAssetStore";
import { getSynchronizedItemPhase } from "./getSynchronizedItemPhase";
import { ItemAnimator } from "./ItemAnimator";

export interface ItemIconAnimationFrame {
  readonly appearance: TibiaObject | null;
  readonly phase: number;
}

/** Never wake more often than one display frame, whatever the schedule says. */
const MINIMUM_WAKE_MS = 16;

interface Listener {
  readonly clientId: number | undefined;
  readonly spriteId: number;
  readonly notify: () => void;
}

const listeners = new Set<Listener>();
/**
 * One animation per appearance, shared by every icon of that item — the same
 * shape as OTClient, where the `Animator` lives on the `ThingType`, so two
 * potions in a container are never a frame apart. (The world keeps per-instance
 * animations instead: there, when an item appeared is what a play-once schedule
 * counts from.) A counted schedule that runs out of loops freezes for the rest of
 * the session, as it does in OTClient.
 */
const animators = new Map<number, ItemAnimator>();
/** The phase each appearance shows right now; the value icons render from. */
const phases = new Map<number, number>();
/** Appearances resolved by a bare sprite id, dropping ambiguous first frames. */
let byFirstSprite: Map<number, TibiaObject | null> | null = null;
let revisionValue = 0;
let clockMs = 0;
let lastWakeMs: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let loading: Promise<void> | null = null;
let ready = false;

function appearanceOf(
  clientId: number | undefined,
  spriteId: number,
): TibiaObject | null {
  if (!ready) return null;
  if (clientId === undefined) return byFirstSprite?.get(spriteId) ?? null;
  try {
    return getSharedAssetStore().item(clientId);
  } catch {
    return null;
  }
}

/**
 * Icons that only know a sprite id resolve through its first frame; the handful
 * of appearances sharing one resolve to nothing, so no icon can ever animate
 * into another item's art.
 */
function indexFirstSprites(): void {
  const index = new Map<number, TibiaObject | null>();
  for (const appearance of getSharedAssetStore().itemAppearances()) {
    const first = appearance.sprites[0];
    if (!first) continue;
    index.set(first, index.has(first) ? null : appearance);
  }
  byFirstSprite = index;
}

/** The phase to draw; pure — animators are only created while ticking. */
function phaseOf(appearance: TibiaObject | null): number {
  if (!appearance) return 0;
  const known = phases.get(appearance.clientId);
  if (known !== undefined) return known;
  const schedule = getItemAnimationSchedule(appearance);
  if (!schedule) return 0;
  if (schedule.synchronized) {
    return getSynchronizedItemPhase(schedule, clockMs).phase;
  }
  return schedule.startPhase ?? 0;
}

/**
 * Advances every mounted icon's animation and sleeps until the next phase
 * boundary any of them is waiting on, so an item Tibia holds for two seconds
 * costs one wake rather than a hundred and twenty.
 */
function advance(): void {
  timer = null;
  const now = Date.now();
  const delta = lastWakeMs === null ? 0 : Math.max(0, now - lastWakeMs);
  lastWakeMs = now;
  clockMs += delta;

  const active = new Map<number, TibiaObject>();
  for (const listener of listeners) {
    const appearance = appearanceOf(listener.clientId, listener.spriteId);
    if (appearance && getItemAnimationSchedule(appearance)) {
      active.set(appearance.clientId, appearance);
    }
  }

  const changed = new Set<number>();
  let nextWakeMs = Number.POSITIVE_INFINITY;
  for (const [clientId, appearance] of active) {
    const schedule = getItemAnimationSchedule(appearance);
    if (!schedule) continue;
    if (schedule.synchronized) {
      const { phase, remainingMs } = getSynchronizedItemPhase(schedule, clockMs);
      if (phases.get(clientId) !== phase) {
        phases.set(clientId, phase);
        changed.add(clientId);
      }
      nextWakeMs = Math.min(nextWakeMs, remainingMs);
      continue;
    }
    let animator = animators.get(clientId);
    if (!animator) {
      animator = new ItemAnimator(schedule, clientId);
      animators.set(clientId, animator);
      phases.set(clientId, animator.phase);
    } else if (animator.advance(delta)) {
      phases.set(clientId, animator.phase);
      changed.add(clientId);
    }
    nextWakeMs = Math.min(nextWakeMs, animator.remainingMs);
  }

  if (changed.size > 0) revisionValue += 1;
  for (const listener of listeners) {
    const appearance = appearanceOf(listener.clientId, listener.spriteId);
    if (appearance && changed.has(appearance.clientId)) listener.notify();
  }
  if (Number.isFinite(nextWakeMs)) {
    timer = setTimeout(advance, Math.max(MINIMUM_WAKE_MS, nextWakeMs));
  }
}

function restartClock(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  lastWakeMs = Date.now();
  advance();
}

/**
 * The object catalog is the one `AssetStore` the world renderer already loads;
 * icons never trigger a second fetch, and stay on their first frame until it is
 * there. An animation is decoration and must never break the inventory.
 */
function loadCatalog(): void {
  if (loading) return;
  loading = getSharedAssetStore()
    .load()
    .then(() => {
      indexFirstSprites();
      ready = true;
      revisionValue += 1;
      for (const listener of listeners) listener.notify();
      restartClock();
    })
    .catch(() => undefined);
}

export const itemIconAnimationStore = {
  subscribe(
    clientId: number | undefined,
    spriteId: number,
    notify: () => void,
  ): () => void {
    const listener: Listener = { clientId, spriteId, notify };
    listeners.add(listener);
    loadCatalog();
    if (ready) restartClock();
    return () => {
      listeners.delete(listener);
      if (listeners.size > 0) return;
      if (timer) clearTimeout(timer);
      timer = null;
      lastWakeMs = null;
    };
  },

  /** Bumped whenever any mounted icon's frame changes; the React snapshot. */
  revision(): number {
    return revisionValue;
  },

  frame(clientId: number | undefined, spriteId: number): ItemIconAnimationFrame {
    const appearance = appearanceOf(clientId, spriteId);
    return { appearance, phase: phaseOf(appearance) };
  },
};
