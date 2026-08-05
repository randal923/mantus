import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  computeWheelBonuses,
  type CreateCharacterMessage,
  type ListCharactersMessage,
  type SelectCharacterMessage,
  type ServerErrorCode,
  type WheelBonuses,
} from "@tibia/protocol";
import type { BestiaryTracker } from "./bestiary/BestiaryTracker";
import type { Character } from "./character/Character";
import { CharacterError } from "./character/CharacterError";
import type { CharacterPersistence } from "./character/CharacterPersistence";
import type { CharacterService } from "./character/CharacterService";
import { getAccountStatus } from "./getAccountStatus";
import type { CarriedCombatLocks } from "./LingeringPlayers";
import { monotonicNow } from "./monotonicNow";
import { Player } from "./Player";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { Visibility } from "./Visibility";
import type { World } from "./World";
import type { DepotService } from "./depot/DepotService";
import type { LoadedDepot } from "./depot/LoadedDepot";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";
import type { LoadedInventory } from "./item/LoadedInventory";
import { deriveCharacterStats } from "./progression/deriveCharacterStats";
import { projectFightState } from "./combat/projectFightState";
import type { SpellRegistry } from "./combat/SpellRegistry";
import type { TradeService } from "./trade/TradeService";
import type { GuildService } from "./guild/GuildService";
import type { ModerationService } from "./moderation/ModerationService";
import type { PvpTracker } from "./pvp/PvpTracker";
import type { PersistedCooldown } from "./combat/CooldownStore";
import type { CooldownTracker } from "./combat/CooldownTracker";
import { persistableCooldowns } from "./combat/persistableCooldowns";
import type { PvpKillRecord } from "./pvp/PvpStore";
import type { MarkerService } from "./minimap/MarkerService";
import type { OutfitService } from "./outfit/OutfitService";
import type { PreyService } from "./prey/PreyService";
import type { DailyRewardService } from "./daily/DailyRewardService";
import type { HuntingTaskService } from "./huntingTasks/HuntingTaskService";
import type { BoostedService } from "./boosted/BoostedService";
import type { BossSlotService } from "./bestiary/BossSlotService";
import type { TrackerService } from "./bestiary/TrackerService";
import type { ForgeService } from "./forge/ForgeService";
import type { AnimusService } from "./proficiency/AnimusService";
import type { ProficiencyService } from "./proficiency/ProficiencyService";
import type { ProfileService } from "./profile/ProfileService";
import type { FriendService } from "./social/FriendService";
import type { VipService } from "./social/VipService";
import { equippedGemsOf } from "./wheel/equippedGemsOf";
import type { GemCharacterData } from "./wheel/GemStore";
import type { GemTracker } from "./wheel/GemTracker";
import type { WheelTracker } from "./wheel/WheelTracker";
import { ResolvedOutcomes } from "./ResolvedOutcomes";
import { playerAffixEffects } from "./rarity/playerAffixEffects";

export class CharacterHandler {
  private readonly outcomes = new ResolvedOutcomes();

  constructor(
    private readonly service: CharacterService,
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly items: ItemIntentHandler,
    private readonly depot: DepotService,
    private readonly spells: SpellRegistry,
    private readonly trade: TradeService,
    private readonly guilds: GuildService,
    private readonly pvp: PvpTracker,
    private readonly vips: VipService,
    private readonly friends: FriendService,
    private readonly profiles: ProfileService,
    private readonly prey: PreyService,
    private readonly daily: DailyRewardService,
    private readonly huntingTasks: HuntingTaskService,
    private readonly boosted: BoostedService,
    private readonly trackers: TrackerService,
    private readonly bossSlots: BossSlotService,
    private readonly forge: ForgeService,
    private readonly proficiency: ProficiencyService,
    private readonly animus: AnimusService,
    private readonly markers: MarkerService,
    private readonly outfits: OutfitService,
    private readonly moderation: ModerationService,
    private readonly bestiary: BestiaryTracker,
    private readonly wheel: WheelTracker,
    private readonly gems: GemTracker,
    private readonly cooldowns: CooldownTracker,
    /**
     * Reclaims a character still lingering in the world after an in-fight
     * disconnect. Returns the combat locks to carry onto the reconnecting
     * player, so relogging cannot shed them (charter rule 8).
     */
    private readonly reclaimLingering: (
      characterId: string,
      now: number,
    ) => CarriedCombatLocks | null = () => null,
  ) {}

  handleList(session: Session, _intent: ListCharactersMessage): void {
    const account = this.beginOperation(session);
    if (!account) return;
    void this.resolveList(session, account.id);
  }

  handleCreate(session: Session, intent: CreateCharacterMessage): void {
    const account = this.beginOperation(session);
    if (!account) return;
    void this.resolveCreate(session, account.id, intent);
  }

  handleSelect(session: Session, intent: SelectCharacterMessage): void {
    if (session.playerId) {
      session.sendError("already-joined");
      return;
    }
    const account = this.beginOperation(session);
    if (!account) return;
    void this.resolveSelection(session, account.id, intent.characterId);
  }

  applyResolvedOutcomes(): void {
    this.outcomes.applyAll();
  }

  private beginOperation(session: Session): Session["account"] {
    if (!session.account) return null;
    if (session.characterOperationPending) {
      session.sendError("character-operation-pending");
      return null;
    }
    session.characterOperationPending = true;
    return session.account;
  }

  private async resolveList(session: Session, accountId: string): Promise<void> {
    try {
      const characters = await this.service.list(accountId);
      this.outcomes.push(() => {
        if (!this.finishOperation(session, accountId)) return;
        const account = session.account;
        if (!account) return;
        session.send({
          type: "character-list",
          ...getAccountStatus(account, monotonicNow()),
          characters,
          creationOptions: this.service.creationOptions(),
        });
      });
    } catch (cause) {
      this.queueFailure(session, accountId, "character-list-failed", cause);
    }
  }

  private async resolveCreate(
    session: Session,
    accountId: string,
    intent: CreateCharacterMessage,
  ): Promise<void> {
    try {
      const characters = await this.service.create(accountId, {
        displayName: intent.name,
        vocation: intent.vocation,
        sex: intent.sex,
      });
      this.outcomes.push(() => {
        if (!this.finishOperation(session, accountId)) return;
        const account = session.account;
        if (!account) return;
        session.send({
          type: "character-list",
          ...getAccountStatus(account, monotonicNow()),
          characters,
          creationOptions: this.service.creationOptions(),
        });
      });
    } catch (cause) {
      const code =
        cause instanceof CharacterError
          ? this.publicErrorFor(cause)
          : "character-list-failed";
      this.queueFailure(session, accountId, code, cause);
    }
  }

  private async resolveSelection(
    session: Session,
    accountId: string,
    characterId: string,
  ): Promise<void> {
    try {
      const character = await this.service.findForSelection(
        accountId,
        characterId,
      );
      this.outcomes.push(() => {
        if (!this.isCurrentOperation(session, accountId)) return;
        if (!character) {
          this.finishOperation(session, accountId);
          session.sendError("character-not-found");
          return;
        }
        // A namelocked character stays out of the world until renamed;
        // relogging does not clear the flag (Feature 67).
        if (character.namelocked) {
          this.finishOperation(session, accountId);
          session.sendError("character-namelocked");
          return;
        }
        this.evictExistingSession(character.id, session);
        // Retire any lingering entity before the fresh entry loads, so its
        // damage is flushed first and there is never a second entity.
        this.carriedLocksByCharacter.set(
          character.id,
          this.reclaimLingering(character.id, monotonicNow()),
        );
        void this.resolveWorldEntry(session, accountId, character.id);
      });
    } catch (cause) {
      this.queueFailure(session, accountId, "character-load-failed", cause);
    }
  }

  private readonly carriedLocksByCharacter = new Map<
    string,
    CarriedCombatLocks | null
  >();

  private async resolveWorldEntry(
    session: Session,
    accountId: string,
    characterId: string,
  ): Promise<void> {
    try {
      await this.persistence.flushCharacter(characterId);
      const character = await this.service.findForSelection(
        accountId,
        characterId,
      );
      let wheelSlices: ReadonlyArray<number> = [];
      let gemData: GemCharacterData | null = null;
      let depot: LoadedDepot | null = null;
      let pvpFrags: ReadonlyArray<PvpKillRecord> = [];
      let bestiaryKills: ReadonlyMap<number, number> = new Map();
      let cooldowns: ReadonlyArray<PersistedCooldown> = [];
      if (character) {
        // Sequential, not Promise.all: each load checks out its own pooled
        // client, and the fan-out let one login hold five at once (more —
        // gem data is itself three queries). None of these depend on each
        // other, so serializing costs round trips and buys back the pool.
        wheelSlices = await this.wheel.load(character.id);
        gemData = await this.gems.load(character.id);
        depot = await this.depot.load(character.id);
        pvpFrags = await this.pvp.load(character.id);
        bestiaryKills = await this.bestiary.load(character.id);
        cooldowns = await this.cooldowns.load(character.id);
      }
      const wheelBonuses = character
        ? computeWheelBonuses(
            wheelSlices,
            character.vocation,
            gemData
              ? {
                  equipped: equippedGemsOf(gemData),
                  grades: gemData.grades,
                }
              : undefined,
          )
        : null;
      const inventory = character
        ? await this.items.load(
            character.id,
            deriveCharacterStats({
              vocation: character.vocation,
              definitionVersion: character.progressionDefinitionVersion,
              level: character.level,
              wheel: wheelBonuses ?? undefined,
            }).capacity,
          )
        : null;
      this.outcomes.push(() => {
        if (!this.isCurrentOperation(session, accountId)) return;
        if (!character) {
          this.finishOperation(session, accountId);
          session.sendError("character-not-found");
          return;
        }
        // A namelocked character stays out of the world until renamed;
        // relogging does not clear the flag (Feature 67).
        if (character.namelocked) {
          this.finishOperation(session, accountId);
          session.sendError("character-namelocked");
          return;
        }
        const existing = this.registry.sessionFor(characterId);
        if (existing && existing.id !== session.id) {
          this.evictExistingSession(characterId, session);
          void this.resolveWorldEntry(session, accountId, characterId);
          return;
        }
        if (!this.finishOperation(session, accountId)) return;
        if (!inventory) {
          session.sendError("character-load-failed");
          return;
        }
        this.enterWorld(
          session,
          character,
          inventory,
          depot,
          pvpFrags,
          bestiaryKills,
          wheelSlices,
          gemData,
          wheelBonuses ?? computeWheelBonuses([], character.vocation),
          cooldowns,
        );
      });
    } catch (cause) {
      this.queueFailure(session, accountId, "character-load-failed", cause);
    }
  }

  private enterWorld(
    session: Session,
    character: Character,
    loadedInventory: LoadedInventory,
    loadedDepot: LoadedDepot | null,
    pvpFrags: ReadonlyArray<PvpKillRecord>,
    bestiaryKills: ReadonlyMap<number, number>,
    wheelSlices: ReadonlyArray<number>,
    gemData: GemCharacterData | null,
    wheelBonuses: WheelBonuses,
    cooldowns: ReadonlyArray<PersistedCooldown> = [],
  ): void {
    if (session.playerId) {
      session.sendError("already-joined");
      return;
    }
    const spawn = this.world.findSpawn({
      x: character.positionX,
      y: character.positionY,
      z: character.positionZ,
    });
    if (!spawn) {
      session.sendError("world-full");
      session.terminate();
      return;
    }
    const now = monotonicNow();
    const account = session.account;
    if (!account) return;
    const accountStatus = getAccountStatus(account, now);
    // Affix max HP/mana are seeded from the already-loaded inventory before
    // the constructor clamps health, exactly like the wheel contribution.
    const wornAffixes = playerAffixEffects(
      loadedInventory.items.flatMap((item) =>
        item.location.kind === "equipment" ? [{ item }] : [],
      ),
    );
    const player = new Player(
      character,
      spawn,
      now,
      account.premiumUntil,
      wheelBonuses,
      { maxHealth: wornAffixes.maxHealth, maxMana: wornAffixes.maxMana },
    );
    // Combat locks survive the reconnect: a killer who relogs mid-fight is
    // still locked, and still pz-locked out of protection zones.
    const carried = this.carriedLocksByCharacter.get(character.id) ?? null;
    this.carriedLocksByCharacter.delete(character.id);
    if (carried) {
      for (const [type, durationMs] of [
        ["combat-lock", carried.combatLockMs],
        ["pz-lock", carried.pzLockMs],
      ] as const) {
        if (durationMs <= 0) continue;
        player.conditions.apply({ type, sourceId: null, durationMs }, now);
      }
    }
    this.persistence.track(player, now);
    this.world.addPlayer(player);
    if (
      spawn.x !== character.positionX ||
      spawn.y !== character.positionY ||
      spawn.z !== character.positionZ
    ) {
      this.persistence.saveNow(player, now);
    }
    session.playerId = player.id;
    session.actionBar = character.actionBar.map((slot) => ({
      ...slot,
      action: slot.action ? { ...slot.action } : null,
    }));
    session.actionBotSettings = {
      ...character.actionBotSettings,
      rules: [...character.actionBotSettings.rules],
    };
    session.lootFilter = {
      ...character.lootFilter,
      ignoredItemTypeIds: [...character.lootFilter.ignoredItemTypeIds],
    };
    session.huntingBotRoute = {
      ...character.huntingBotRoute,
      waypoints: character.huntingBotRoute.waypoints.map((waypoint) => ({
        ...waypoint,
      })),
    };
    // A character never logs in already walking a route.
    session.huntingBotEnabled = false;
    session.huntingBotWaypointIndex = 0;
    session.aimAtTargetSpellIds = new Set(character.aimAtTargetSpellIds);
    // Cooldowns persisted at the last logout; expired rows drop here and
    // the first fight-state projection (the welcome below) carries the rest,
    // so relogging never shortens a cooldown (charter rule 8).
    for (const cooldown of cooldowns) {
      if (cooldown.readyAt <= now) continue;
      if (session.combatCooldowns.has(cooldown.key)) continue;
      session.combatCooldowns.set(cooldown.key, {
        readyAt: cooldown.readyAt,
        totalMs: cooldown.totalMs,
      });
    }
    this.registry.bindPlayer(session);
    const inventory = this.items.attach(loadedInventory);
    if (loadedDepot) this.depot.attach(loadedDepot);
    this.trade.recoverOrphans(session, player.id);
    this.guilds.attachCharacter(session, player.id);
    this.vips.attachCharacter(session, player.id);
    this.friends.attachCharacter(session, player.id);
    this.profiles.attachCharacter(session, player.id);
    this.prey.attachCharacter(session, player.id);
    this.daily.attachCharacter(session, player.id);
    this.huntingTasks.attachCharacter(session, player.id);
    this.trackers.attachCharacter(session, player.id);
    this.bossSlots.attachCharacter(session, player.id);
    this.forge.attachCharacter(session, player.id);
    this.proficiency.attachCharacter(session, player.id);
    this.animus.attachCharacter(session, player.id);
    this.boosted.announceTo(session);
    this.markers.attachCharacter(session, player.id);
    this.outfits.attachCharacter(session, player.id);
    this.moderation.attachCharacter(player.id);
    this.bestiary.attach(player.id, bestiaryKills);
    this.wheel.attach(player.id, wheelSlices);
    if (gemData) this.gems.attach(player.id, gemData);
    // Attach before the spawn announcement so viewers already receive the
    // correct (possibly restored) persistent skull in the creature state.
    this.pvp.attach(player, pvpFrags, now);
    const creatures = this.visibility.announceSpawn(session, player);
    session.send({
      type: "welcome",
      playerId: player.id,
      mantusCoins: account.mantusCoins,
      bankBalance: loadedInventory.bankBalance,
      ...accountStatus,
      character: this.service.ownState(player, now),
      map: { name: this.world.mapName },
      creatures,
      inventory,
      fightState: projectFightState(session, this.world, now),
      spells: this.spells.projectFor(player),
      uiSettings: session.account?.uiSettings ?? {},
      actionBar: character.actionBar,
      actionBotSettings: character.actionBotSettings,
      lootFilter: character.lootFilter,
      huntingBotRoute: character.huntingBotRoute,
      aimAtTargetSpellIds: [...character.aimAtTargetSpellIds],
    });
    this.visibility.syncMapItems(session, player);
    void this.service
      .recordLogin(character.accountId, character.id, new Date(monotonicNow()))
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(
          `failed to record login for character ${character.id}: ${reason}`,
        );
      });
  }

  private evictExistingSession(characterId: string, replacement: Session): void {
    const existing = this.registry.sessionFor(characterId);
    if (!existing || existing.id === replacement.id) return;
    const player = this.world.getPlayer(characterId);
    if (player) {
      this.trade.detachCharacter(characterId, monotonicNow());
      this.guilds.detachCharacter(characterId);
      this.vips.detachCharacter(characterId);
      this.moderation.detachCharacter(characterId);
      this.pvp.detachCharacter(characterId);
      this.persistence.untrack(player, monotonicNow());
      this.items.detach(characterId);
      this.depot.detachCharacter(characterId);
      this.world.removePlayer(characterId);
      this.visibility.announceLeave(existing, player);
    }
    existing.playerId = null;
    existing.movementDirection = null;
    existing.bufferedMovementDirection = null;
    existing.attackTargetId = null;
    // The evicted session's cooldowns are flushed before the replacement's
    // load runs (the tracker orders the write ahead of the read), so a
    // dual-login cannot shed them either.
    this.cooldowns.flush(
      characterId,
      persistableCooldowns(existing.combatCooldowns, monotonicNow()),
    );
    existing.combatCooldowns.clear();
    existing.actionBotRuleReadyAt.clear();
    existing.itemOperationPending = false;
    existing.potionPersistPending = false;
    existing.depotOperationPending = false;
    existing.actionBarUpdatePending = false;
    existing.actionBotUpdatePending = false;
    existing.actionBar = createDefaultActionBar();
    existing.actionBotSettings = {
      ...DEFAULT_ACTION_BOT_SETTINGS,
      rules: [],
    };
    existing.itemPersistsPending = 0;
    existing.travelOperationPending = false;
    existing.promotionOperationPending = false;
    existing.knownCreatureIds.clear();
    existing.knownMapItemTiles.clear();
    this.registry.unbindPlayer(characterId, existing);
    existing.sendError("logged-in-elsewhere");
    existing.terminate();
  }

  private finishOperation(session: Session, accountId: string): boolean {
    session.characterOperationPending = false;
    return this.isCurrentOperation(session, accountId);
  }

  private isCurrentOperation(session: Session, accountId: string): boolean {
    return (
      this.registry.contains(session) && session.account?.id === accountId
    );
  }

  private queueFailure(
    session: Session,
    accountId: string,
    code: ServerErrorCode,
    cause: unknown,
  ): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`character operation failed for account ${accountId}: ${reason}`);
    this.outcomes.push(() => {
      if (!this.finishOperation(session, accountId)) return;
      session.sendError(code);
    });
  }

  private publicErrorFor(error: CharacterError): ServerErrorCode {
    if (error.code === "limit-reached") return "character-limit-reached";
    if (error.code === "name-invalid") return "character-name-invalid";
    if (error.code === "name-taken") return "character-name-taken";
    return "character-list-failed";
  }
}
