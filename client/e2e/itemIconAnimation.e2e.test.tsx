import { expect, test } from "vitest";
import { createRoot } from "react-dom/client";
import { SpriteIcon } from "../components/inventory/SpriteIcon";

/**
 * Mounts the real SpriteIcon in a real browser against the real object catalog
 * (`/assets/objects.json`, the same one the world renderer loads) and asserts
 * item icons behave the way Tibia draws them:
 *
 * - a multi-phase item cycles its phases: the exercise sword (5 phases) and a
 *   supreme health potion (12 phases),
 * - a single-phase item never moves,
 * - a stack draws the pile art for its size — 100 gold coins are not one coin,
 * - an item larger than one tile is drawn whole: a 2×2 verocious bat is four
 *   pieces, not just its bottom-right corner.
 */
const EXERCISE_SWORD = { clientId: 28_552, spriteId: 25_676 };
/** The epic tier: the lasting sword's art plus its own purple aura. */
const EPIC_EXERCISE_SWORD = { clientId: 60_002, spriteId: 29_442 };
const LASTING_EXERCISE_SWORD = { clientId: 35_285, spriteId: 29_442 };
const SUPREME_HEALTH_POTION = { clientId: 23_375, spriteId: 23_396 };
const GOLD_COIN = { clientId: 3_031, spriteId: 7_384 };
const VEROCIOUS_BAT = { clientId: 12_246, spriteId: 500_785 };
/** The catalog is a 37MB fetch on a cold browser profile; sample past it. */
const SAMPLE_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pieces(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>("[style*=background-image]"),
  ];
}

function iconCell(container: HTMLElement): string {
  const [first] = pieces(container);
  if (!first) throw new Error("sprite icon piece not found");
  return `${first.style.backgroundImage} ${first.style.backgroundPosition}`;
}

function mount(host: HTMLElement, node: React.ReactNode): HTMLElement {
  const slot = document.createElement("div");
  host.append(slot);
  createRoot(slot).render(node);
  return slot;
}

test("item icons animate, stack, and draw whole", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const sword = mount(
    host,
    <SpriteIcon
      spriteId={EXERCISE_SWORD.spriteId}
      clientId={EXERCISE_SWORD.clientId}
    />,
  );
  const potion = mount(
    host,
    <SpriteIcon
      spriteId={SUPREME_HEALTH_POTION.spriteId}
      clientId={SUPREME_HEALTH_POTION.clientId}
    />,
  );
  const singleCoin = mount(
    host,
    <SpriteIcon
      spriteId={GOLD_COIN.spriteId}
      clientId={GOLD_COIN.clientId}
      count={1}
    />,
  );
  const coinPile = mount(
    host,
    <SpriteIcon
      spriteId={GOLD_COIN.spriteId}
      clientId={GOLD_COIN.clientId}
      count={100}
    />,
  );
  const bat = mount(
    host,
    <SpriteIcon
      spriteId={VEROCIOUS_BAT.spriteId}
      clientId={VEROCIOUS_BAT.clientId}
    />,
  );

  const swordCells = new Set<string>();
  const potionCells = new Set<string>();
  const coinCells = new Set<string>();
  const deadline = Date.now() + SAMPLE_MS;
  while (Date.now() < deadline) {
    // Crops land asynchronously; sample an icon once it has drawn something.
    if (pieces(sword).length > 0) swordCells.add(iconCell(sword));
    if (pieces(potion).length > 0) potionCells.add(iconCell(potion));
    if (pieces(singleCoin).length > 0) coinCells.add(iconCell(singleCoin));
    await sleep(40);
  }

  expect(swordCells.size).toBeGreaterThanOrEqual(3);
  expect(potionCells.size).toBeGreaterThanOrEqual(4);
  expect(coinCells.size).toBe(1);
  expect(iconCell(coinPile)).not.toBe(iconCell(singleCoin));
  expect(pieces(bat)).toHaveLength(4);
}, 60_000);

/**
 * A server-added item type is an alias of a stock appearance, so the epic
 * exercise sword and the lasting one it copies draw the same weapon — what
 * separates them is the colour of the spark that art already animates. This
 * mounts both and asserts the alias resolves at all (its id is past the ripped
 * range, so without the alias it draws nothing), that it still animates, and
 * that its frames are recoloured rather than shared with the stock item.
 */
test("a custom item tier animates the stock art in its own colour", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const epic = mount(
    host,
    <SpriteIcon
      spriteId={EPIC_EXERCISE_SWORD.spriteId}
      clientId={EPIC_EXERCISE_SWORD.clientId}
    />,
  );
  const lasting = mount(
    host,
    <SpriteIcon
      spriteId={LASTING_EXERCISE_SWORD.spriteId}
      clientId={LASTING_EXERCISE_SWORD.clientId}
    />,
  );

  const epicCells = new Set<string>();
  const lastingCells = new Set<string>();
  const deadline = Date.now() + SAMPLE_MS;
  while (Date.now() < deadline) {
    if (pieces(epic).length > 0) epicCells.add(iconCell(epic));
    if (pieces(lasting).length > 0) lastingCells.add(iconCell(lasting));
    await sleep(40);
  }

  // The alias resolved and the borrowed animation still plays.
  expect(epicCells.size).toBeGreaterThanOrEqual(3);
  expect(lastingCells.size).toBeGreaterThanOrEqual(3);
  // Tinted crops are their own images: no frame is shared with the stock item.
  for (const cell of epicCells) expect(lastingCells.has(cell)).toBe(false);
}, 60_000);
