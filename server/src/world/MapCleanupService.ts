import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { collectCleanableWorldItems } from "../item/collectCleanableWorldItems";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";

export interface MapCleanupConfig {
  readonly intervalMs: number;
  /** Minutes of warning before the sweep; one broadcast per minute. */
  readonly warningMinutes: number;
  readonly cleanProtectionZones: boolean;
}

interface MapCleaner {
  cleanWorldItems(items: ReadonlyArray<Item>, now: number): number;
}

const MINUTE_MS = 60_000;
/** Ground items swept per tick, so a long-uncleaned map never stalls one. */
const MAX_REMOVALS_PER_TICK = 200;

/**
 * The recurring map clean: every `intervalMs` the server drops the loose items
 * players and monsters left on the ground, after counting the sweep down to
 * everyone online. Canary announces its global server save the same way — one
 * broadcast per remaining minute — and its `cleanMap()` is what the sweep
 * itself mirrors.
 *
 * Everything here happens on the tick: the countdown is checked against tick
 * time, and the sweep hands its items to the item pipeline, which mutates
 * memory synchronously and trails the row deletes on the ordered write lane
 * (charter rules 3 and 5). A backlog is drained over consecutive ticks rather
 * than in one long pause, and the total is announced once it is done.
 */
export class MapCleanupService {
  private nextCleanAt: number;
  /** Countdown minutes still to announce, largest first. */
  private pendingWarnings: number[] = [];
  private sweep: Item[] = [];
  private sweptCount = 0;

  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly items: MapCleaner,
    private readonly registry: SessionRegistry,
    private readonly config: MapCleanupConfig,
    startedAt: number,
  ) {
    this.nextCleanAt = startedAt + config.intervalMs;
    this.armWarnings();
  }

  /** When the next sweep begins, for status/probe output. */
  get scheduledAt(): number {
    return this.nextCleanAt;
  }

  tick(now: number): void {
    if (this.sweep.length > 0) {
      this.drain(now);
      return;
    }
    this.announceDueWarnings(now);
    if (now < this.nextCleanAt) return;
    this.nextCleanAt = now + this.config.intervalMs;
    this.armWarnings();
    this.sweep = collectCleanableWorldItems(this.world, this.catalog, {
      cleanProtectionZones: this.config.cleanProtectionZones,
    });
    this.sweptCount = 0;
    if (this.sweep.length === 0) {
      this.announce("The map was already clean: no items removed.");
      return;
    }
    this.drain(now);
  }

  private drain(now: number): void {
    const batch = this.sweep.splice(0, MAX_REMOVALS_PER_TICK);
    this.sweptCount += this.items.cleanWorldItems(batch, now);
    if (this.sweep.length > 0) return;
    const count = this.sweptCount;
    this.sweptCount = 0;
    this.announce(
      `Cleaned ${count} item${count === 1 ? "" : "s"} from the map.`,
    );
  }

  private armWarnings(): void {
    this.pendingWarnings = [];
    for (let minute = this.config.warningMinutes; minute >= 1; minute--) {
      this.pendingWarnings.push(minute);
    }
  }

  private announceDueWarnings(now: number): void {
    // A tick that skipped ahead can leave several minutes due at once; only
    // the nearest of them is worth saying out loud.
    let due: number | undefined;
    while (this.pendingWarnings.length > 0) {
      const minute = this.pendingWarnings[0];
      if (minute === undefined) break;
      if (now < this.nextCleanAt - minute * MINUTE_MS) break;
      this.pendingWarnings.shift();
      due = minute;
    }
    if (due === undefined) return;
    this.announce(
      `The map will be cleaned in ${due} minute${due === 1 ? "" : "s"}. Items left on the ground will be removed.`,
    );
  }

  /**
   * Server-wide notice. It carries no position or per-player state, so there
   * is nothing here a player could not already see (charter rule 6).
   */
  private announce(text: string): void {
    for (const session of this.registry.all()) {
      if (!session.playerId) continue;
      session.send({ type: "server-notice", category: "broadcast", text });
    }
  }
}
