import {
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
import type { PvpKillRecord } from "./pvp/PvpStore";
import type { VipService } from "./social/VipService";
import { equippedGemsOf } from "./wheel/equippedGemsOf";
import type { GemCharacterData } from "./wheel/GemStore";
import type { GemTracker } from "./wheel/GemTracker";
import type { WheelTracker } from "./wheel/WheelTracker";

export class CharacterHandler {
  private readonly outcomes: Array<() => void> = [];

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
    private readonly moderation: ModerationService,
    private readonly bestiary: BestiaryTracker,
    private readonly wheel: WheelTracker,
    private readonly gems: GemTracker,
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
    for (const outcome of this.outcomes.splice(0)) outcome();
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
        lookType: intent.lookType,
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
        this.evictExistingSession(character.id, session);
        void this.resolveWorldEntry(session, accountId, character.id);
      });
    } catch (cause) {
      this.queueFailure(session, accountId, "character-load-failed", cause);
    }
  }

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
      const wheelSlices = character ? await this.wheel.load(character.id) : [];
      const gemData = character ? await this.gems.load(character.id) : null;
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
      const depot = character ? await this.depot.load(character.id) : null;
      const pvpFrags = character ? await this.pvp.load(character.id) : [];
      const bestiaryKills = character
        ? await this.bestiary.load(character.id)
        : new Map<number, number>();
      this.outcomes.push(() => {
        if (!this.isCurrentOperation(session, accountId)) return;
        if (!character) {
          this.finishOperation(session, accountId);
          session.sendError("character-not-found");
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
    const player = new Player(
      character,
      spawn,
      now,
      account.premiumUntil,
      wheelBonuses,
    );
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
    this.registry.bindPlayer(session);
    const inventory = this.items.attach(loadedInventory);
    if (loadedDepot) this.depot.attach(loadedDepot);
    this.trade.recoverOrphans(session, player.id);
    this.guilds.attachCharacter(session, player.id);
    this.vips.attachCharacter(session, player.id);
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
      ...accountStatus,
      character: this.service.ownState(player, now),
      map: { name: this.world.mapName },
      creatures,
      inventory,
      fightState: projectFightState(session, this.world, now),
      spells: this.spells.projectFor(player),
      uiSettings: session.account?.uiSettings ?? {},
      actionBar: character.actionBar,
      potionActionBar: character.potionActionBar,
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
    existing.itemOperationPending = false;
    existing.potionPersistPending = false;
    existing.depotOperationPending = false;
    existing.actionBarUpdatePending = false;
    existing.potionActionBarUpdatePending = false;
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
