import type { CharacterVocation } from "@tibia/protocol";
import { Monster } from "../creature/Monster";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { CombatFeedback } from "./CombatFeedback";
import { SPELL_FAILURE_EFFECT_ID } from "./combatConstants";
import type { ConditionApplication } from "./Condition";
import { ConditionSystem } from "./ConditionSystem";
import { creaturesInArea } from "./creaturesInArea";
import { isInRange } from "./isInRange";
import type { SpellDefinition } from "./Spell";
import type { TargetingHooks } from "./TargetingHooks";

/** Canary `doChallengeCreature(creature, target)` default focus window. */
const CHALLENGE_FOCUS_MS = 12_000;
/** Canary chain spells: 6-tile reach, melee pull for 12 s. */
const CHAIN_RANGE = 6;
const CHAIN_PULL_MS = 12_000;
const CHIVALROUS_CHALLENGE_TARGETS = 5;
const DIVINE_DAZZLE_TARGETS = 3;
/** Canary creature_illusion.lua: CONDITION_OUTFIT for 180 s. */
const ILLUSION_MS = 180_000;
/** Canary mentor_other.lua: a 60 s vocation-specific buff. */
const MENTOR_MS = 60_000;

/**
 * The reviewed TypeScript bodies of Canary's procedural player-spell
 * callbacks. Everything here runs synchronously inside the tick, after the
 * regular cast pipeline has already re-validated vocation, level, mana,
 * soul, range, and cooldowns. Each action re-resolves its own targets from
 * live world state and refuses rather than guessing (charter rules 1 and 4).
 */
export class PlayerSpellActions {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly registry: SessionRegistry,
    private readonly feedback: CombatFeedback,
    private readonly conditions: ConditionSystem,
  ) {}

  private targeting: TargetingHooks | null = null;

  attachTargeting(targeting: TargetingHooks): void {
    this.targeting = targeting;
  }

  /**
   * Runs the action and reports whether the cast should be paid for. A false
   * result means nothing happened, so the caller must not spend resources.
   */
  execute(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    parameter: string | null,
    now: number,
  ): boolean {
    switch (spell.playerAction) {
      case "challenge":
        return this.challengeArea(player, spell, now);
      case "chivalrous-challenge":
        return this.chain(player, now, CHIVALROUS_CHALLENGE_TARGETS, true);
      case "divine-dazzle":
        return this.chain(player, now, DIVINE_DAZZLE_TARGETS, false);
      case "creature-illusion":
        return this.creatureIllusion(session, player, parameter, now);
      case "summon-creature":
        return this.summonCreature(session, player, spell, parameter, now);
      case "mentor-other":
        return this.mentorOther(session, player, spell, parameter, now);
      default:
        return false;
    }
  }

  /** Canary challenge.lua: challenges every monster in the 3x3 square. */
  private challengeArea(
    player: Player,
    spell: SpellDefinition,
    now: number,
  ): boolean {
    const targeting = this.targeting;
    if (!targeting) return false;
    let challenged = false;
    for (const creature of creaturesInArea(
      this.world,
      player.position,
      player.position,
      spell.area,
    )) {
      if (!(creature instanceof Monster)) continue;
      if (
        targeting.challengeMonster(creature, player, now, CHALLENGE_FOCUS_MS)
      ) {
        challenged = true;
      }
    }
    return challenged;
  }

  /**
   * Canary's chain challenge spells: pick the nearest unowned ranged monsters
   * within reach and pull them into melee, optionally challenging them too.
   */
  private chain(
    player: Player,
    now: number,
    maxTargets: number,
    challenge: boolean,
  ): boolean {
    const targeting = this.targeting;
    if (!targeting) return false;
    const candidates = this.world
      .creaturesNear(player.position, { x: CHAIN_RANGE, y: CHAIN_RANGE })
      .filter(
        (creature): creature is Monster =>
          creature instanceof Monster &&
          creature.health > 0 &&
          creature.position.z === player.position.z &&
          creature.type.flags.targetDistance > 1 &&
          !targeting.isSummon(creature) &&
          isInRange(player.position, creature.position, CHAIN_RANGE) &&
          this.world.hasLineOfSight(player.position, creature.position),
      )
      .sort(
        (left, right) =>
          this.tileDistance(player, left) - this.tileDistance(player, right) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, maxTargets);
    let affected = false;
    for (const monster of candidates) {
      const pulled = targeting.pullMonsterToMelee(
        monster,
        1,
        now,
        CHAIN_PULL_MS,
      );
      const challenged =
        challenge &&
        targeting.challengeMonster(monster, player, now, CHALLENGE_FOCUS_MS);
      if (!pulled && !challenged) continue;
      affected = true;
      this.visibility.broadcastMagicEffect(monster.position, 219, monster.id);
    }
    return affected;
  }

  /** Canary creature_illusion.lua: take an illusionable monster's outfit. */
  private creatureIllusion(
    session: Session,
    player: Player,
    parameter: string | null,
    now: number,
  ): boolean {
    const type = parameter
      ? this.targeting?.findMonsterTypeByName(parameter)
      : undefined;
    if (!type || !type.flags.illusionable) {
      this.fizzle(session, player, now, "spell-parameter-invalid");
      return false;
    }
    this.conditions.applyCondition(
      player,
      {
        type: "outfit",
        sourceId: player.id,
        durationMs: ILLUSION_MS,
        outfit: { ...type.outfit },
      },
      now,
    );
    return true;
  }

  /**
   * Canary summon_creature.lua. The monster's own mana cost is charged on top
   * of the spell's, and the shared summon limit is enforced by the spawn
   * runtime — never by the client.
   */
  private summonCreature(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    parameter: string | null,
    now: number,
  ): boolean {
    const targeting = this.targeting;
    const type = parameter
      ? targeting?.findMonsterTypeByName(parameter)
      : undefined;
    if (!targeting || !type || !type.flags.summonable) {
      this.fizzle(session, player, now, "spell-parameter-invalid");
      return false;
    }
    if (targeting.playerSummonCount(player.id) >= PLAYER_SUMMON_LIMIT) {
      this.fizzle(session, player, now, "spell-summon-limit");
      return false;
    }
    // Re-check the monster's mana cost against live mana at execution time,
    // *including* the spell's own cost: the caller spends that immediately
    // after this returns true, and it must never be able to underpay.
    if (player.mana < type.manaCost + spell.manaCost) {
      this.fizzle(session, player, now, "spell-mana-insufficient");
      return false;
    }
    const summon = targeting.summonForPlayer(player, type.id, now);
    if (!summon) {
      this.fizzle(session, player, now, "spell-not-possible");
      return false;
    }
    if (type.manaCost > 0 && !player.spendMana(type.manaCost)) {
      throw new Error("summon mana diverged");
    }
    this.visibility.broadcastMagicEffect(summon.position, 11, summon.id);
    return true;
  }

  /** Canary mentor_other.lua: a vocation-specific buff on one player. */
  private mentorOther(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    parameter: string | null,
    now: number,
  ): boolean {
    const target = this.resolveNamedPlayer(session, player, spell, parameter);
    if (!target) {
      this.fizzle(session, player, now, "spell-target-invalid");
      return false;
    }
    const condition = mentorConditionFor(target.vocation, player.id);
    this.conditions.applyCondition(target, condition, now);
    this.visibility.broadcastMagicEffect(target.position, 13, target.id);
    return true;
  }

  /**
   * Name-parameterized targeting: falls back to the attack target when no
   * name is given. The named player must be visible to this session, so the
   * spell can never confirm the location of someone off-screen.
   */
  private resolveNamedPlayer(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    parameter: string | null,
  ): Player | null {
    if (!parameter) {
      const targetId = session.attackTargetId;
      const target = targetId ? this.world.getCreature(targetId) : undefined;
      return target instanceof Player &&
        isInRange(player.position, target.position, spell.range)
        ? target
        : player;
    }
    const normalized = parameter.trim().toLowerCase();
    for (const other of this.registry.all()) {
      const candidate = other.playerId
        ? this.world.getPlayer(other.playerId)
        : undefined;
      if (
        !candidate ||
        candidate.name.toLowerCase() !== normalized ||
        !isInRange(player.position, candidate.position, spell.range) ||
        !session.knownCreatureIds.has(candidate.id) ||
        !this.world.canSee(
          player.position,
          candidate.position,
          session.viewRange,
        )
      ) {
        continue;
      }
      return candidate;
    }
    return null;
  }

  private tileDistance(player: Player, monster: Monster): number {
    return Math.max(
      Math.abs(player.position.x - monster.position.x),
      Math.abs(player.position.y - monster.position.y),
    );
  }

  private fizzle(
    session: Session,
    player: Player,
    now: number,
    code: Parameters<CombatFeedback["reject"]>[2],
  ): void {
    this.visibility.broadcastMagicEffect(
      player.position,
      SPELL_FAILURE_EFFECT_ID,
      player.id,
    );
    this.feedback.reject(session, now, code);
  }
}

/** Mirrors SpawnManager's PLAYER_MAX_SUMMONS; checked again there. */
const PLAYER_SUMMON_LIMIT = 2;

function mentorConditionFor(
  vocation: CharacterVocation,
  sourceId: string,
): ConditionApplication {
  const attributes =
    vocation === "Knight" || vocation === "Elite Knight"
      ? { damageReceivedPercent: 97 }
      : vocation === "Sorcerer" || vocation === "Master Sorcerer"
        ? { damageDealtPercent: 105 }
        : vocation === "Druid" || vocation === "Elder Druid"
          ? { healingDealtPercent: 105 }
          : { damageDealtPercent: 105 };
  return {
    type: "attributes",
    sourceId,
    durationMs: MENTOR_MS,
    attributes,
  };
}
