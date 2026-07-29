// Builds client/public/assets/item-animations.json: the sprite frames the DOM
// item icons cycle through and how long each frame is held, so an exercise
// weapon, a supreme potion or a love elixir animates in the inventory, store
// and shop exactly as it does in the world — which is what the official client
// and OTClient both do.
//
// Timings come from `appearance-animations.json` (Tibia's own schedule, see
// tools/importAppearanceAnimations.mjs). Items missing from that table keep the
// flat legacy fallback.
//
// Entries are keyed by client id — the stable appearance identity — with the
// first frame's sprite id stored alongside, so icons that only know a sprite
// id can still resolve their animation when that sprite belongs to exactly one
// schedule.
//
// Only single-tile, single-layer, single-pattern items are emitted: those are
// the ones a 32x32 icon draws whole. Anything with count patterns (coin
// stacks) or multi-tile art keeps drawing its first sprite.
//
// Usage: node tools/buildItemAnimations.mjs
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceManifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const appearances = JSON.parse(
  await readFile(join(repoRoot, "client/public/assets/objects.json"), "utf8"),
);
const timings = JSON.parse(
  await readFile(
    join(repoRoot, "client/public/assets/appearance-animations.json"),
    "utf8",
  ),
);

if (
  appearances.formatVersion !== sourceManifest.converters.assets ||
  appearances.source?.datSha256 !== sourceManifest.sources.dat.sha256 ||
  appearances.source?.sprSha256 !== sourceManifest.sources.spr.sha256
) {
  throw new Error("DAT appearances do not match the pinned source manifest");
}
if (timings.source?.sha256 !== sourceManifest.sources.canaryAppearances.sha256) {
  throw new Error("animation timings do not match the pinned source manifest");
}

// The fallback for items Tibia's schedule table does not cover — keep in sync
// with client/lib/render/LEGACY_FRAME_DURATION_MS.ts, which the world renderer
// uses for the same case.
const FALLBACK_DURATION_MS = 100;

function phaseDurations(schedule, phases) {
  if (!schedule) return Array.from({ length: phases }, () => FALLBACK_DURATION_MS);
  const { d } = schedule;
  return Array.from({ length: phases }, (_, phase) =>
    typeof d === "number" ? d : (d[phase] ?? FALLBACK_DURATION_MS),
  );
}

/**
 * Frames and hold times for one icon. Ping-pong schedules are expanded into the
 * sequence they play, and phases Tibia holds for 0ms — the terminal frame of a
 * play-once animation — are dropped, since an icon loops forever.
 */
function iconAnimation(appearance) {
  if (
    appearance.category !== "item" ||
    appearance.phases <= 1 ||
    appearance.width !== 1 ||
    appearance.height !== 1 ||
    appearance.layers !== 1 ||
    appearance.px !== 1 ||
    appearance.py !== 1 ||
    appearance.pz !== 1
  ) {
    return null;
  }
  const sprites = appearance.sprites.slice(0, appearance.phases);
  if (sprites.length !== appearance.phases) return null;
  if (sprites.some((sprite) => !Number.isInteger(sprite) || sprite <= 0)) {
    return null;
  }

  const schedule = timings.animations.item[appearance.clientId];
  const durations = phaseDurations(schedule, appearance.phases);
  const order = sprites.map((_, phase) => phase);
  if (schedule?.l === "ping-pong" && appearance.phases > 2) {
    for (let phase = appearance.phases - 2; phase > 0; phase--) order.push(phase);
  }

  const played = order.filter((phase) => durations[phase] > 0);
  if (played.length < 2) return null;
  return {
    frames: played.map((phase) => sprites[phase]),
    durations: played.map((phase) => durations[phase]),
  };
}

// Most animations are a consecutive run of sprite ids held for one shared
// duration, which stores as just the first sprite, the frame count and that
// duration.
const animations = {};
let count = 0;
for (const appearance of appearances.objects) {
  const animation = iconAnimation(appearance);
  if (!animation) continue;
  const base = animation.frames[0];
  const consecutive = animation.frames.every(
    (sprite, index) => sprite === base + index,
  );
  const uniform = animation.durations.every(
    (duration) => duration === animation.durations[0],
  );
  animations[appearance.clientId] = {
    b: base,
    f: consecutive ? animation.frames.length : animation.frames,
    d: uniform ? animation.durations[0] : animation.durations,
  };
  count += 1;
}

const output = {
  formatVersion: 3,
  source: {
    datSha256: sourceManifest.sources.dat.sha256,
    sprSha256: sourceManifest.sources.spr.sha256,
    appearancesSha256: sourceManifest.sources.canaryAppearances.sha256,
  },
  fallbackDurationMs: FALLBACK_DURATION_MS,
  animations,
};
const outputPath = join(repoRoot, "client/public/assets/item-animations.json");
await writeFile(outputPath, `${JSON.stringify(output)}\n`);
const scheduled = Object.values(animations).filter(
  (entry) => entry.d !== FALLBACK_DURATION_MS || Array.isArray(entry.d),
).length;
console.log(
  `item animations written: ${count} (${scheduled} on a non-default schedule)`,
);
