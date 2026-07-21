import type {
  ActionBar,
  PotionActionBar,
  UpdateActionBarMessage,
  UpdatePotionActionBarMessage,
} from "@tibia/protocol";
import type { CharacterStore } from "./character/CharacterStore";
import type { SpellRegistry } from "./combat/SpellRegistry";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";
import { getPotionDefinition } from "./potion/getPotionDefinition";

export class ActionBarHandler {
  private readonly outcomes: Array<() => void> = [];

  constructor(
    private readonly registry: SessionRegistry,
    private readonly world: World,
    private readonly spells: SpellRegistry,
    private readonly characters: CharacterStore,
  ) {}

  handle(
    session: Session,
    intent: UpdateActionBarMessage | UpdatePotionActionBarMessage,
  ): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!playerId || !player) {
      session.sendError("join-required");
      return;
    }
    if (
      intent.type === "update-potion-action-bar" &&
      session.potionActionBarUpdatePending
    ) {
      session.sendError("action-bar-update-pending");
      return;
    }
    if (
      intent.type === "update-action-bar" &&
      session.actionBarUpdatePending
    ) {
      session.sendError("action-bar-update-pending");
      return;
    }
    if (intent.type === "update-potion-action-bar") {
      for (const slot of intent.potionActionBar) {
        if (slot && !getPotionDefinition(slot.itemTypeId)) {
          session.sendError("action-bar-invalid");
          return;
        }
      }
      session.potionActionBarUpdatePending = true;
      void this.persistPotions(session, playerId, intent.potionActionBar);
      return;
    }
    // Only spells the character's own vocation can ever cast may be slotted;
    // level/mana gates stay cast-time checks so low-level slots are allowed.
    for (const spellId of intent.actionBar) {
      if (spellId === null) continue;
      const spell = this.spells.get(spellId);
      if (
        !spell ||
        spell.origin !== "spell" ||
        !spell.vocations.includes(player.vocation)
      ) {
        session.sendError("action-bar-invalid");
        return;
      }
    }
    session.actionBarUpdatePending = true;
    void this.persist(session, playerId, intent.actionBar);
  }

  private async persistPotions(
    session: Session,
    characterId: string,
    potionActionBar: PotionActionBar,
  ): Promise<void> {
    try {
      await this.characters.updatePotionActionBar(
        characterId,
        potionActionBar,
      );
      this.outcomes.push(() => {
        session.potionActionBarUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.send({
          type: "potion-action-bar-updated",
          potionActionBar,
        });
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `potion action bar update failed for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.potionActionBarUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.sendError("action-bar-update-failed");
      });
    }
  }

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  private async persist(
    session: Session,
    characterId: string,
    actionBar: ActionBar,
  ): Promise<void> {
    try {
      await this.characters.updateActionBar(characterId, actionBar);
      this.outcomes.push(() => {
        session.actionBarUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.send({ type: "action-bar-updated", actionBar });
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `action bar update failed for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.actionBarUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.sendError("action-bar-update-failed");
      });
    }
  }
}
