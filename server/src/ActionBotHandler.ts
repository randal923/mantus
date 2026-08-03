import type {
  ActionBotRule,
  ActionBotSettings,
  CharacterVocation,
  UpdateActionBotMessage,
} from "@tibia/protocol";
import type { CharacterStore } from "./character/CharacterStore";
import type { SpellRegistry } from "./combat/SpellRegistry";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";
import { sanitizeActionBarAction } from "./sanitizeActionBarAction";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";
import { ResolvedOutcomes } from "./ResolvedOutcomes";

/**
 * Owns the action bot configuration. Rules carry their own action, so nothing
 * here consults the action bar — a rule is validated against the character's
 * own spell list and the item catalog, exactly like a bar button is.
 */
export class ActionBotHandler {
  private readonly outcomes = new ResolvedOutcomes();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly world: World,
    private readonly spells: SpellRegistry,
    private readonly items: ItemIntentHandler,
    private readonly characters: CharacterStore,
  ) {}

  handle(session: Session, intent: UpdateActionBotMessage): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!playerId || !player) {
      session.sendError("join-required");
      return;
    }
    if (session.actionBotUpdatePending) {
      session.sendError("action-bot-update-pending");
      return;
    }

    const settings = this.sanitize(intent.settings, player.vocation);
    if (!settings) {
      session.sendError("action-bot-invalid");
      return;
    }
    session.actionBotUpdatePending = true;
    void this.persist(session, playerId, settings);
  }

  applyResolvedOutcomes(): void {
    this.outcomes.applyAll();
  }

  private sanitize(
    settings: ActionBotSettings,
    vocation: CharacterVocation,
  ): ActionBotSettings | null {
    if (settings.autoHaste.enabled) {
      const haste = this.spells.get(settings.autoHaste.spellId);
      if (
        !haste ||
        haste.origin !== "spell" ||
        !haste.vocations.includes(vocation)
      ) {
        return null;
      }
    }
    if (settings.autoUtamoVita) {
      const utamoVita = this.spells.get("utamo-vita");
      if (
        !utamoVita ||
        utamoVita.origin !== "spell" ||
        !utamoVita.vocations.includes(vocation)
      ) {
        return null;
      }
    }
    const ids = new Set<string>();
    const rules: ActionBotRule[] = [];
    for (const rule of settings.rules) {
      if (ids.has(rule.id)) return null;
      ids.add(rule.id);
      const action = sanitizeActionBarAction(
        rule.action,
        vocation,
        this.spells,
        this.items,
      );
      if (!action || action.kind === "text") return null;
      rules.push({ ...rule, action });
    }
    return { ...settings, rules };
  }

  private async persist(
    session: Session,
    characterId: string,
    settings: ActionBotSettings,
  ): Promise<void> {
    try {
      await this.characters.updateActionBot(characterId, settings);
      this.outcomes.push(() => {
        session.actionBotUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.actionBotSettings = {
          ...settings,
          rules: [...settings.rules],
        };
        session.send({ type: "action-bot-updated", settings });
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `action bot update failed for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.actionBotUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.send({
          type: "action-bot-updated",
          settings: session.actionBotSettings,
        });
        session.sendError("action-bot-update-failed");
      });
    }
  }
}
