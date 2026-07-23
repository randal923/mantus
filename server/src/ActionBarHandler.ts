import {
  createDefaultActionBar,
  type ActionBar,
  type ActionBarAction,
  type ActionBotSettings,
  type CharacterVocation,
  type UpdateActionBarMessage,
} from "@tibia/protocol";
import type { CharacterStore } from "./character/CharacterStore";
import type { SpellRegistry } from "./combat/SpellRegistry";
import { getSpellActionTargetMode } from "./combat/getSpellActionTargetMode";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";

export class ActionBarHandler {
  private readonly outcomes: Array<() => void> = [];

  constructor(
    private readonly registry: SessionRegistry,
    private readonly world: World,
    private readonly spells: SpellRegistry,
    private readonly items: ItemIntentHandler,
    private readonly characters: CharacterStore,
  ) {}

  handle(
    session: Session,
    intent: UpdateActionBarMessage,
  ): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!playerId || !player) {
      session.sendError("join-required");
      return;
    }
    if (session.actionBarUpdatePending) {
      session.sendError("action-bar-update-pending");
      return;
    }

    const sanitized = this.sanitizeActionBar(intent.actionBar, player.vocation);
    if (
      !sanitized ||
      !this.validBotSettings(
        intent.settings,
        sanitized,
        player.vocation,
      )
    ) {
      session.sendError("action-bar-invalid");
      return;
    }
    session.actionBarUpdatePending = true;
    void this.persist(session, playerId, sanitized, intent.settings);
  }

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  private sanitizeActionBar(
    requested: ActionBar,
    vocation: CharacterVocation,
  ): ActionBar | null {
    const next = createDefaultActionBar();
    const hotkeys = new Set<string>();
    for (const [index, slot] of requested.entries()) {
      if (slot.hotkey && hotkeys.has(slot.hotkey)) return null;
      if (slot.hotkey) hotkeys.add(slot.hotkey);
      const action = slot.action
        ? this.sanitizeAction(slot.action, vocation)
        : null;
      if (slot.action && !action) return null;
      next[index] = { action, hotkey: slot.hotkey };
    }
    return next;
  }

  private sanitizeAction(
    action: ActionBarAction,
    vocation: CharacterVocation,
  ): ActionBarAction | null {
    if (action.kind === "text") return { ...action };
    if (action.kind === "item") {
      const type = this.items.itemType(action.itemTypeId);
      if (!type || (action.mode === "equip" && !type.equipmentSlot)) {
        return null;
      }
      return { ...action };
    }
    const spell = this.spells.get(action.spellId);
    if (
      !spell ||
      spell.origin !== "spell" ||
      !spell.vocations.includes(vocation)
    ) {
      return null;
    }
    const targetMode = getSpellActionTargetMode(
      spell.targetKind,
      action.targetMode,
    );
    return { ...action, targetMode };
  }

  private validBotSettings(
    settings: ActionBotSettings,
    actionBar: ActionBar,
    vocation: CharacterVocation,
  ): boolean {
    if (settings.autoHaste.enabled) {
      const haste = this.spells.get(settings.autoHaste.spellId);
      if (
        !haste ||
        haste.origin !== "spell" ||
        !haste.vocations.includes(vocation)
      ) {
        return false;
      }
    }
    if (settings.autoUtamoVita) {
      const utamoVita = this.spells.get("utamo-vita");
      if (
        !utamoVita ||
        utamoVita.origin !== "spell" ||
        !utamoVita.vocations.includes(vocation)
      ) {
        return false;
      }
    }
    const ids = new Set<string>();
    for (const rule of settings.rules) {
      const action = actionBar[rule.slotIndex]?.action;
      if (ids.has(rule.id) || !action || action.kind === "text") return false;
      ids.add(rule.id);
    }
    return true;
  }

  private async persist(
    session: Session,
    characterId: string,
    actionBar: ActionBar,
    settings: ActionBotSettings,
  ): Promise<void> {
    try {
      await this.characters.updateActionBar(
        characterId,
        actionBar,
        settings,
      );
      this.outcomes.push(() => {
        session.actionBarUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.actionBar = actionBar.map((slot) => ({
          ...slot,
          action: slot.action ? { ...slot.action } : null,
        }));
        session.actionBotSettings = {
          ...settings,
          rules: [...settings.rules],
        };
        session.send({
          type: "action-bar-updated",
          actionBar,
          settings,
        });
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
        session.send({
          type: "action-bar-updated",
          actionBar: session.actionBar,
          settings: session.actionBotSettings,
        });
        session.sendError("action-bar-update-failed");
      });
    }
  }
}
