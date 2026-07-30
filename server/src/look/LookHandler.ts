import type { LookMessage, Position } from "@tibia/protocol";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemType } from "../item/ItemType";
import { mapItemAttributes } from "../action/mapItemAttributes";
import type { MapItem } from "../MapItem";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import { describeCreatureLook } from "./describeCreatureLook";
import { describeItemLook } from "./describeItemLook";
import type {
  GuildLookState,
  PartyLookState,
} from "./describePlayerLook";
import {
  houseLookDescription,
  type HouseLookState,
} from "./houseLookDescription";
import { lookDistance } from "./lookDistance";
import { sanitizeLookText } from "./sanitizeLookText";

const MAX_LOOK_TEXT_LENGTH = 1_024;

interface LookLookups {
  readonly house?: (position: Position) => HouseLookState | null;
  readonly party?: (playerId: string) => PartyLookState | null;
  readonly guild?: (characterId: string) => GuildLookState | null;
}

/**
 * Tibia's look (Canary `playerLookAt` / `playerLookInBattleList`): the client
 * says what was pointed at, the server composes the whole "You see ..." line.
 *
 * Every check runs here at execution time inside the tick (charter rules 4
 * and 5): the tile has to be in the session's current view, and a creature has
 * to be one this client was already told about and can still see, so a look
 * can never reveal an out-of-view creature or tile (rule 6).
 */
export class LookHandler {
  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly lookups: LookLookups = {},
  ) {}

  /**
   * A look that resolves to nothing answers nothing at all. There is no error
   * to report: the shared `item-action-failed` code carries side effects a
   * look must not cause (it rolls the optimistic inventory queue back and
   * puffs the player), and staying silent is also what keeps a refused look
   * from confirming whether something is standing there.
   */
  handle(session: Session, intent: LookMessage): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!player) return;
    const description =
      intent.target.kind === "creature"
        ? this.describeCreature(session, player, intent.target.creatureId)
        : this.describeTile(
            session,
            player,
            intent.target.position,
            intent.target.itemId,
          );
    if (!description) return;
    session.send({
      type: "look-text",
      text: sanitizeLookText(`You see ${description}`).slice(
        0,
        MAX_LOOK_TEXT_LENGTH,
      ),
    });
  }

  private describeCreature(
    session: Session,
    player: Player,
    creatureId: string,
  ): string | null {
    const self = creatureId === player.id;
    // A creature this client was never told about stays invisible to it, and
    // visibility is re-checked now rather than when the click was queued.
    if (!self && !session.knownCreatureIds.has(creatureId)) return null;
    const creature = this.world.getCreature(creatureId);
    if (!creature) return null;
    if (
      !self &&
      !this.world.canCreatureSee(player, creature.position, session.viewRange)
    ) {
      return null;
    }
    return describeCreatureLook(creature, self, {
      party: this.lookups.party?.(creature.id) ?? null,
      guild: this.lookups.guild?.(creature.id) ?? null,
    });
  }

  private describeTile(
    session: Session,
    player: Player,
    position: Position,
    clientItemId: number | undefined,
  ): string | null {
    if (!this.world.canSee(player.position, position, session.viewRange)) {
      return null;
    }
    const resolved = this.resolveTileItem(position, clientItemId);
    if (!resolved) return null;
    const { type, item } = resolved;
    const distance = lookDistance(player.position, position);
    // No instance for static scenery: like Canary's type-only look, it reports
    // no per-instance line (imbuement slots, forge tier, engraved text).
    let description = describeItemLook(type, distance, {
      count: item?.count ?? 1,
      ...(item ? { attributes: mapItemAttributes(this.world, item) } : {}),
    });
    // Canary stamps the ownership text onto a house's own doors, so a look at
    // one reads it back; house ownership is public in Tibia.
    if (type.door) {
      const house = this.lookups.house?.(position) ?? null;
      if (house) description += `\n${houseLookDescription(house)}`;
    }
    return description;
  }

  /**
   * Prefers the server's own authoritative world item on the tile; static
   * scenery lives only in the client's region artifact, so its client id is
   * accepted as a *reference* and validated against the pinned catalog before
   * anything reads from it (charter rule 1).
   */
  private resolveTileItem(
    position: Position,
    clientItemId: number | undefined,
  ): { readonly type: ItemType; readonly item?: MapItem } | null {
    const items = [...this.world.getMapItems(position)].sort(
      (left, right) => right.stackIndex - left.stackIndex,
    );
    if (clientItemId !== undefined) {
      const placed = items.find((item) => item.itemId === clientItemId);
      if (placed) {
        const type = this.catalog.get(placed.itemId);
        if (type) return { type, item: placed };
      }
      const type = this.catalog.get(clientItemId);
      if (type) return { type };
    }
    for (const item of items) {
      const type = this.catalog.get(item.itemId);
      if (type) return { type, item };
    }
    return null;
  }
}
