import type { Position } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { DamageRequest } from "../combat/Damage";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { PartyHooks } from "../party/PartyHooks";
import { Player } from "../Player";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { Visibility } from "../Visibility";
import { drainDue } from "../drainDue";
import type { Creature } from "./Creature";
import { Monster } from "./Monster";
import type { MonsterEventHooks } from "./MonsterEventHooks";

export class MonsterEventService implements MonsterEventHooks {
  private readonly worldStorage = new Map<string, number>();
  private readonly scheduledStorage: Array<{
    readonly executeAt: number;
    readonly key: string;
    readonly value: number;
  }> = [];
  private readonly scheduledSpawns: Array<{
    readonly executeAt: number;
    readonly typeId: string;
    readonly position: Position;
    readonly removeAfterMs?: number;
  }> = [];
  private readonly scheduledRemovals: Array<{
    readonly executeAt: number;
    readonly creatureId: string;
  }> = [];
  private readonly scheduledItemRemovals: Array<{
    readonly executeAt: number;
    readonly position: Position;
    readonly instanceId?: string;
    readonly itemTypeId?: number;
  }> = [];
  private readonly scheduledTeleports: Array<{
    readonly executeAt: number;
    readonly monsterId: string;
    readonly playerId: string;
    readonly position: Position;
    readonly message: string;
  }> = [];
  private readonly scheduledTransformations: Array<{
    readonly executeAt: number;
    readonly monsterId: string;
    readonly typeId: string;
  }> = [];
  private readonly uglyMonsterSources = new Set<string>();
  private readonly tileRevisionByCreature = new WeakMap<Creature, number>();
  private readonly teleportCooldownUntil = new Map<string, number>();
  private nextTormentAt = 0;
  private randomState: number;

  constructor(
    private readonly world: World,
    private readonly persistence: CharacterPersistence,
    private readonly visibility: Visibility,
    private readonly registry: SessionRegistry,
    private readonly items: ItemIntentHandler,
    seed: number,
    private readonly spawnMonster: (
      typeId: string,
      position: Position,
      now: number,
    ) => string | null,
    private readonly removeMonster: (creatureId: string, now: number) => void,
    private readonly transformMonster: (
      creatureId: string,
      typeId: string,
      now: number,
    ) => boolean,
    private readonly partyHooks?: PartyHooks,
  ) {
    this.randomState = seed >>> 0 || 0x9e3779b9;
  }

  tick(now: number): void {
    for (const entry of drainDue(this.scheduledStorage, now)) {
      this.worldStorage.set(entry.key, entry.value);
    }
    for (const entry of drainDue(this.scheduledSpawns, now)) {
      const creatureId = this.spawnMonster(entry.typeId, entry.position, now);
      if (creatureId && entry.removeAfterMs) {
        this.scheduledRemovals.push({
          executeAt: now + entry.removeAfterMs,
          creatureId,
        });
      }
    }
    for (const entry of drainDue(this.scheduledRemovals, now)) {
      this.removeMonster(entry.creatureId, now);
      this.worldStorage.set("GlobalStorage.UglyMonster", 0);
    }
    for (const entry of drainDue(this.scheduledItemRemovals, now)) {
      if (entry.instanceId) {
        this.items.removeWorldItem(entry.instanceId, entry.position, now);
      } else if (entry.itemTypeId) {
        this.items.removeFirstWorldItemByTypeIds(
          entry.position,
          0,
          [entry.itemTypeId],
          now,
        );
      }
    }
    for (const entry of drainDue(this.scheduledTeleports, now)) {
      const monster = this.world.getCreature(entry.monsterId);
      const player = this.world.getPlayer(entry.playerId);
      if (
        !(monster instanceof Monster) ||
        !player ||
        !this.world.isPathable(entry.position)
      ) {
        continue;
      }
      this.visibility.broadcastCreatureSpeech(monster, entry.message, false);
      const from = this.world.relocateCreature(monster, entry.position);
      this.visibility.broadcastMagicEffect(from, 11, monster.id);
      this.visibility.onCreatureStepped(monster, from, 0);
      this.visibility.broadcastMagicEffect(monster.position, 11, monster.id);
    }
    for (const entry of drainDue(this.scheduledTransformations, now)) {
      this.transformMonster(entry.monsterId, entry.typeId, now);
    }
    for (const [playerId, expiresAt] of this.teleportCooldownUntil) {
      if (expiresAt <= now) this.teleportCooldownUntil.delete(playerId);
    }
  }

  onMonsterSpawn(monster: Monster, now: number): void {
    if (!monster.type.callbacks.includes("onSpawn")) return;
    if (
      monster.type.id === "cobra-assassin" ||
      monster.type.id === "cobra-scout" ||
      monster.type.id === "cobra-vizier"
    ) {
      const expiresAt = this.worldStorage.get("Global.Storage.CobraFlask") ?? -1;
      if (expiresAt >= Math.floor(now / 1_000)) {
        monster.setHealth(Math.floor(monster.maxHealth * 0.75));
        this.visibility.broadcastHealth(monster);
        this.visibility.broadcastMagicEffect(monster.position, 9, monster.id);
      } else {
        this.worldStorage.set("Global.Storage.CobraFlask", -1);
      }
      return;
    }
    if (monster.type.id === "iron-servant-replica") {
      const diamond =
        (this.worldStorage.get(
          "Quest.U11_02.ForgottenKnowledge.MechanismDiamond",
        ) ?? -1) >= 1;
      const golden =
        (this.worldStorage.get(
          "Quest.U11_02.ForgottenKnowledge.MechanismGolden",
        ) ?? -1) >= 1;
      if (this.randomInteger(1, 100) <= 30 || (!diamond && !golden)) return;
      const typeId = diamond && golden
        ? this.randomInteger(1, 2) === 1
          ? "diamond-servant-replica"
          : "golden-servant-replica"
        : diamond
          ? "diamond-servant-replica"
          : "golden-servant-replica";
      this.transformMonster(monster.id, typeId, now);
      return;
    }
    if (monster.type.id === "lesser-splinter-of-madness") {
      this.scheduledTransformations.push({
        executeAt: now + 120_000,
        monsterId: monster.id,
        typeId: "greater-splinter-of-madness",
      });
      return;
    }
    if (monster.type.id === "greater-splinter-of-madness") {
      this.scheduledTransformations.push({
        executeAt: now + 120_000,
        monsterId: monster.id,
        typeId: "mighty-splinter-of-madness",
      });
    }
    // Mighty Splinter's pinned callback references an undefined `creature`
    // before it can remove itself or empower Goshnar's Megalomania.
  }

  onMonsterThink(
    monster: Monster,
    now: number,
  ): ReadonlyArray<{ readonly target: Creature; readonly damage: DamageRequest }> {
    if (!monster.type.callbacks.includes("onThink")) return [];
    const teleportMessages: Readonly<Record<string, string>> = {
      "cloak-of-terror": "I am your terror!",
      "bony-sea-devil": "Get out the way!",
      brachiodemon: "Burn in hell!",
      "many-faces": "Hands off my comrades!",
      "branchy-crawler": "My growth is your death!",
      "spiteful-spitter": "You have been chosen for a harvest!",
    };
    const teleportMessage = teleportMessages[monster.type.id];
    if (teleportMessage) {
      const player = this.world
        .creaturesNear(monster.position, { x: 30, y: 30 })
        .filter((creature): creature is Player =>
          creature instanceof Player && this.isInSoulWarZone(creature.position)
        )
        .sort((left, right) =>
          this.distance(monster.position, right.position) -
            this.distance(monster.position, left.position) ||
          left.id.localeCompare(right.id)
        )[0];
      if (
        player &&
        this.distance(monster.position, player.position) > 0 &&
        (this.teleportCooldownUntil.get(player.id) ?? 0) <= now &&
        this.randomInteger(1, 100) <= 10
      ) {
        this.teleportCooldownUntil.set(player.id, now + 10_000);
        this.visibility.broadcastMagicEffect(monster.position, 18, monster.id);
        this.visibility.broadcastMagicEffect(player.position, 18, player.id);
        this.scheduledTeleports.push({
          executeAt: now + 2_000,
          monsterId: monster.id,
          playerId: player.id,
          position: { ...player.position },
          message: teleportMessage,
        });
      }
      return [];
    }
    if (monster.type.id !== "symbol-of-hatred" || now < this.nextTormentAt) {
      return [];
    }
    this.nextTormentAt = now + 3_000;
    let bossPresent = false;
    for (const creature of this.world.allCreatures()) {
      if (creature.name === "Goshnar's Megalomania") {
        bossPresent = true;
        break;
      }
    }
    const key = "SoulWar.goshnars-hatred-torment-count";
    const damageTable = [
      1_400, 1_600, 1_800, 2_200, 2_400, 2_600, 3_000,
      3_400, 3_800, 4_200, 4_800, 5_200, 5_600,
    ];
    const effects: Array<{ readonly target: Creature; readonly damage: DamageRequest }> = [];
    for (const player of this.world
      .creaturesNear({ x: 33_744, y: 31_599, z: 14 }, { x: 15, y: 15 })
      .filter((creature): creature is Player => creature instanceof Player)) {
      if (!bossPresent) {
        this.set(player, key, 0);
        continue;
      }
      const counter = Math.max(0, player.storageValue(key));
      if (counter > 30) continue;
      this.set(player, key, counter + 1);
      if (counter === 0) continue;
      const amount = counter >= 24
        ? damageTable[counter - 24] ?? damageTable[damageTable.length - 1] ?? 0
        : counter * 35;
      effects.push({
        target: player,
        damage: {
          sourceId: monster.id,
          origin: "monster",
          type: "death",
          minimum: amount,
          maximum: amount,
          effectId: 179,
          ignoreArmor: true,
          ignoreShield: true,
        },
      });
    }
    return effects;
  }

  onPlayerAttackMonster(monster: Monster, attacker: Player, now: number): void {
    if (
      !monster.type.callbacks.includes("onPlayerAttack") ||
      monster.type.id !== "mirror-image"
    ) {
      return;
    }
    const apparitionIds = [
      "druid-s-apparition",
      "knight-s-apparition",
      "paladin-s-apparition",
      "sorcerer-s-apparition",
      "monk-s-apparition",
    ];
    const baseVocation = attacker.vocation.toLowerCase();
    const initial = baseVocation.includes("druid")
      ? "druid-s-apparition"
      : baseVocation.includes("knight")
        ? "knight-s-apparition"
        : baseVocation.includes("paladin")
          ? "paladin-s-apparition"
          : baseVocation.includes("sorcerer")
            ? "sorcerer-s-apparition"
            : baseVocation.includes("monk")
              ? "monk-s-apparition"
              : null;
    const candidates = this.randomInteger(1, 100) > 70
      ? apparitionIds.filter((id) => id !== initial)
      : initial
        ? [initial]
        : apparitionIds;
    const typeId = candidates[this.randomInteger(0, candidates.length - 1)];
    if (typeId) this.transformMonster(monster.id, typeId, now);
  }

  beforeMonsterDamage(
    monster: Monster,
    attacker: Player | Monster | undefined,
    amount: number,
    _now: number,
  ): number {
    if (
      !(attacker instanceof Player) ||
      !monster.type.events.includes("FourthTaintBossesPrepareDeath") ||
      monster.health - amount >= 1 ||
      attacker.storageValue("SoulWar.taints-heal") !== 1 ||
      !this.isInSoulWarZone(attacker.position) ||
      this.randomInteger(1, 10) !== 1
    ) {
      return amount;
    }
    monster.setHealth(monster.maxHealth);
    this.visibility.broadcastHealth(monster);
    this.visibility.broadcastCreatureSpeech(
      monster,
      "Health restored by the mystic powers of Zarganash!",
      false,
    );
    return amount;
  }

  onMonsterDamaged(
    monster: Monster,
    attacker: Player | Monster | undefined,
    amount: number,
    now: number,
  ): void {
    if (
      monster.type.events.includes("UglyMonsterSpawn") &&
      !this.uglyMonsterSources.has(monster.id) &&
      (this.worldStorage.get("GlobalStorage.UglyMonster") ?? -1) !== 1 &&
      this.randomInteger(1, 1_000_000) < amount
    ) {
      this.uglyMonsterSources.add(monster.id);
      this.worldStorage.set("GlobalStorage.UglyMonster", 1);
      this.scheduledSpawns.push({
        executeAt: now,
        typeId: "ugly-monster",
        position: { ...monster.position },
        removeAfterMs: 60_000,
      });
    }
    if (
      attacker instanceof Player &&
      monster.type.events.includes("CloakOfTerrorHealthLoss") &&
      amount > 0
    ) {
      const hasBlood = this.world.getMapItems(monster.position).some(
        (item) => item.itemId === 33_854,
      );
      if (!hasBlood) {
        this.items.createEventWorldItem(
          this.eventId("cloak-blood", monster, now),
          33_854,
          monster.position,
          {},
          now,
        );
      }
    }
    if (
      monster.type.events.includes("UglyMonsterDrop") &&
      this.randomInteger(1, 100) === 100
    ) {
      const common = [3_577, 3_582, 836, 3_587, 3_591, 3_593, 3_586, 3_601];
      const rare = [30_059, 30_060, 30_061];
      const rareRoll = this.randomInteger(1, 100);
      const source = rareRoll >= 98 ? rare : common;
      const itemTypeId = source[this.randomInteger(0, source.length - 1)];
      if (itemTypeId) {
        this.items.createEventWorldItem(
          this.eventId("ugly-drop", monster, now),
          itemTypeId,
          monster.position,
          {},
          now,
        );
      }
    }
  }

  onCreatureTile(creature: Creature, now: number): DamageRequest | null {
    const previousRevision = this.tileRevisionByCreature.get(creature);
    if (previousRevision === undefined) {
      this.tileRevisionByCreature.set(creature, creature.positionRevision);
      return null;
    }
    if (previousRevision === creature.positionRevision) return null;
    this.tileRevisionByCreature.set(creature, creature.positionRevision);
    const blood = this.world.getMapItems(creature.position).find((item) =>
      [33_854, 34_006, 34_007].includes(item.itemId)
    );
    if (blood) {
      this.items.removeWorldItem(blood.instanceId, creature.position, now);
      if (creature instanceof Player) {
        const percentage = blood.itemId === 33_854
          ? 0.2
          : blood.itemId === 34_006
            ? 0.15
            : 0.1;
        const amount = Math.floor(creature.maxHealth * percentage);
        return {
          sourceId: null,
          origin: "monster",
          type: "energy",
          minimum: amount,
          maximum: amount,
          ignoreArmor: true,
          ignoreShield: true,
        };
      }
      if (creature instanceof Monster && creature.name === "Cloak of Terror") {
        const amount = this.randomInteger(1_500, 2_000);
        return {
          sourceId: null,
          origin: "monster",
          type: "healing",
          minimum: amount,
          maximum: amount,
        };
      }
      return null;
    }
    const remains = this.world.getMapItems(creature.position).find(
      (item) => item.itemId === 33_984,
    );
    if (!(creature instanceof Player) || !remains) return null;
    this.items.removeWorldItem(remains.instanceId, creature.position, now);
    const key = "SoulWar.goshnars-hatred-torment-count";
    this.set(creature, key, Math.max(0, creature.storageValue(key) - 5));
    this.visibility.broadcastMagicEffect(creature.position, 50, creature.id);
    return null;
  }

  onMonsterDeath(
    monster: Monster,
    damagerIds: ReadonlyArray<string>,
    mostDamagePlayerId: string | null,
    _now: number,
  ): void {
    const damagers = damagerIds
      .map((id) => this.world.getPlayer(id))
      .filter((player): player is Player => player !== undefined);
    const mostDamagePlayer = mostDamagePlayerId
      ? this.world.getPlayer(mostDamagePlayerId)
      : undefined;
    const party = mostDamagePlayerId
      ? (this.partyHooks?.getQuestParticipantIds(mostDamagePlayerId) ?? [mostDamagePlayerId])
          .map((id) => this.world.getPlayer(id))
          .filter((player): player is Player => player !== undefined)
      : [];
    for (const event of monster.type.events) {
      this.applyDeathEvent(event, monster, damagers, party, mostDamagePlayer, _now);
    }
  }

  private applyDeathEvent(
    event: string,
    monster: Monster,
    damagers: ReadonlyArray<Player>,
    party: ReadonlyArray<Player>,
    mostDamagePlayer: Player | undefined,
    now: number,
  ): void {
    const name = monster.name.toLowerCase();
    if (event === "UglyMonsterCleanup") {
      this.uglyMonsterSources.delete(monster.id);
      return;
    }
    if (event === "UglyMonsterDeath") {
      const removal = this.scheduledRemovals.find(
        (entry) => entry.creatureId === monster.id,
      );
      if (removal) this.scheduledRemovals.splice(this.scheduledRemovals.indexOf(removal), 1);
      this.worldStorage.set("GlobalStorage.UglyMonster", 0);
      return;
    }
    if (event === "CarlinVortexDeath") {
      const itemTypeId = this.randomInteger(32_414, 32_415);
      const instanceId = this.items.createEventWorldItem(
        this.eventId("carlin-vortex", monster, now),
        itemTypeId,
        monster.position,
        { actionId: 5_580 },
        now,
      );
      if (instanceId) {
        this.scheduledItemRemovals.push({
          executeAt: now + 60_000,
          instanceId,
          position: { ...monster.position },
        });
      }
      return;
    }
    if (event === "MakeshiftHomeDeath") {
      this.items.createEventWorldItem(
        this.eventId("makeshift-home", monster, now),
        398,
        monster.position,
        { actionId: 57_233 },
        now,
      );
      return;
    }
    if (event === "RagingMageDeath") {
      this.visibility.broadcastCreatureSpeech(
        monster,
        "I WILL RETURN!! My death will just be a door to await my homecoming, my physical hull will be... my... argh...",
        false,
      );
      this.scheduledItemRemovals.push({
        executeAt: now + 300_000,
        itemTypeId: 11_796,
        position: { x: 33_143, y: 31_527, z: 2 },
      });
      return;
    }
    if (event === "GlowingRubbishAmuletDeath") {
      const mission = "Quest.U11_40.CultsOfTibia.Misguided.Mission";
      const monsters = "Quest.U11_40.CultsOfTibia.Misguided.Monsters";
      const exorcisms = "Quest.U11_40.CultsOfTibia.Misguided.Exorcisms";
      for (const player of party) {
        if (player.storageValue(mission) !== 3) continue;
        if (name === "misguided shadow") {
          const value = Math.max(0, player.storageValue(exorcisms));
          if (value < 5) this.set(player, exorcisms, value + 1);
          continue;
        }
        if (name !== "misguided bully" && name !== "misguided thief") continue;
        const session = this.registry.sessionFor(player.id);
        if (!session) continue;
        const value = Math.max(0, player.storageValue(monsters)) + 1;
        this.set(player, monsters, value);
        if (value < 10) continue;
        this.items.transformEquippedItemForEvent(
          session,
          player.id,
          25_296,
          25_297,
          now,
        );
      }
      return;
    }
    if (event === "NecromanticFocusDeath") {
      // The pinned Canary callback looks up an undefined
      // `necromanticRemainsId`; its delayed callback therefore has no effect.
      return;
    }
    if (event === "MirroredNightmareBossAccess") {
      const key = `SoulWar.mirrored-nightmare.${monster.name}`;
      for (const player of damagers) {
        this.set(player, key, Math.max(0, player.storageValue(key)) + 1);
      }
      return;
    }
    if (event === "RenegadeOrcDeath") {
      this.replaceWhen(damagers, "Quest.U8_54.AnUneasyAlliance.QuestDoor", 0, 1);
      return;
    }
    if (event === "WigglerDeath") {
      this.incrementWhen(
        party,
        "Quest.U9_60.BigfootsBurden.ExterminatedCount",
        10,
        "Quest.U9_60.BigfootsBurden.MissionExterminators",
        1,
      );
      return;
    }
    if (event === "MinotaurCultTaskDeath") {
      this.incrementInRange(
        party,
        "Quest.U11_40.CultsOfTibia.Minotaurs.JamesfrancisTask",
        0,
        49,
      );
      return;
    }
    if (event === "LastExileDeath") {
      if (
        !this.inRange(monster.position, { x: 33_768, y: 32_227, z: 14 }, { x: 33_851, y: 32_352, z: 14 }) ||
        this.world
          .creaturesNear(monster.position, { x: 10, y: 10 })
          .some((creature) => creature.name.toLowerCase() === "makeshift home")
      ) {
        return;
      }
      for (const player of party) {
        if (player.storageValue("Quest.U11_50.DangerousDepths.Dwarves.Home") !== 1) continue;
        const value = player.storageValue("Quest.U11_50.DangerousDepths.Dwarves.LostExiles");
        if (value < 20) this.set(player, "Quest.U11_50.DangerousDepths.Dwarves.LostExiles", value < 0 ? 0 : value + 1);
      }
      return;
    }
    if (event === "WarzoneWormDeath") {
      const value = mostDamagePlayer?.storageValue(
        "Quest.U11_50.DangerousDepths.Dwarves.Organisms",
      ) ?? -1;
      if (value >= 50) return;
      for (const player of party) {
        if (player.storageValue("Quest.U11_50.DangerousDepths.Dwarves.Subterranean") !== 1) continue;
        this.set(player, "Quest.U11_50.DangerousDepths.Dwarves.Organisms", value < 0 ? 0 : value + 1);
      }
      return;
    }
    if (event === "MorrisGoblinDeath") {
      this.incrementWhen(party, "Quest.U10_55.Dawnport.MorrisGoblinCount", 20, "Quest.U10_55.Dawnport.MorrisGoblin", 1);
      return;
    }
    if (event === "MorrisMinotaurDeath") {
      this.incrementWhen(party, "Quest.U10_55.Dawnport.MorrisMinosCount", 20, "Quest.U10_55.Dawnport.MorrisMinos", 1);
      return;
    }
    if (event === "MorrisTrollDeath") {
      this.incrementWhen(party, "Quest.U10_55.Dawnport.MorrisTrollCount", 20, "Quest.U10_55.Dawnport.MorriskTroll", 1);
      return;
    }
    if (event === "ReplicaServantDeath" && mostDamagePlayer) {
      const key = name === "golden servant replica"
        ? "Quest.U11_02.ForgottenKnowledge.GoldenServantCounter"
        : name === "diamond servant replica"
          ? "Quest.U11_02.ForgottenKnowledge.DiamondServantCounter"
          : null;
      if (key) this.set(mostDamagePlayer, key, Math.max(0, mostDamagePlayer.storageValue(key)) + 1);
      return;
    }
    if (event === "grave_danger_death") {
      const values: Readonly<Record<string, readonly [string, string?]>> = {
        gaffir: ["Quest.U12_20.GraveDanger.GaffirKilled"],
        custodian: ["Quest.U12_20.GraveDanger.CustodianKilled"],
        "guard captain quaid": ["Quest.U12_20.GraveDanger.QuaidKilled"],
        "scarlett etzel": ["Quest.U12_20.GraveDanger.ScarlettKilled"],
        "earl osam": ["Quest.U12_20.GraveDanger.Bosses.EarlOsam.Killed", "Quest.U12_20.GraveDanger.Graves.Cormaya"],
        "count vlarkorth": ["Quest.U12_20.GraveDanger.Bosses.CountVlarkorth.Killed", "Quest.U12_20.GraveDanger.Graves.Edron"],
        "sir baeloc": ["Quest.U12_20.GraveDanger.Bosses.BaelocNictros.Killed", "Quest.U12_20.GraveDanger.Graves.Darashia"],
        "duke krule": ["Quest.U12_20.GraveDanger.Bosses.DukeKrule.Killed", "Quest.U12_20.GraveDanger.Graves.Thais"],
        "lord azaram": ["Quest.U12_20.GraveDanger.Bosses.LordAzaram.Killed", "Quest.U12_20.GraveDanger.Graves.Ghostlands"],
        "king zelos": ["Quest.U12_20.GraveDanger.Bosses.KingZelos.Killed"],
      };
      const config = values[name];
      if (!config) return;
      for (const player of damagers) {
        if (player.storageValue(config[0]) >= 1) continue;
        this.set(player, config[0], 1);
        if (!config[1]) continue;
        this.set(player, config[1], 1);
        const progress = "Quest.U12_20.GraveDanger.Graves.Progress";
        this.set(player, progress, player.storageValue(progress) + 1);
      }
      return;
    }
    if (event === "DiseasedTrioDeath") {
      const bossKey: Readonly<Record<string, string>> = {
        "diseased bill": "Quest.U8_4.InServiceOfYalahar.DiseasedBill",
        "diseased dan": "Quest.U8_4.InServiceOfYalahar.DiseasedDan",
        "diseased fred": "Quest.U8_4.InServiceOfYalahar.DiseasedFred",
      };
      const key = bossKey[name];
      if (!key) return;
      for (const player of damagers) {
        if (player.storageValue(key) < 1) this.set(player, key, 1);
        const allKilled = Object.values(bossKey).every((entry) => player.storageValue(entry) === 1);
        const formula = "Quest.U8_4.InServiceOfYalahar.AlchemistFormula";
        if (allKilled && player.storageValue(formula) !== 1) this.set(player, formula, 0);
      }
      return;
    }
    if (event === "QuaraLeadersDeath") {
      const bossKey: Readonly<Record<string, string>> = {
        inky: "Quest.U8_4.InServiceOfYalahar.QuaraInky",
        sharptooth: "Quest.U8_4.InServiceOfYalahar.QuaraSharptooth",
        splasher: "Quest.U8_4.InServiceOfYalahar.QuaraSplasher",
      };
      const key = bossKey[name];
      if (!key) return;
      for (const player of damagers) {
        if (player.storageValue(key) >= 1) continue;
        this.set(player, key, 1);
        this.set(player, "Quest.U8_4.InServiceOfYalahar.QuaraState", 2);
        this.set(player, "Quest.U8_4.InServiceOfYalahar.Questline", 41);
        this.set(player, "Quest.U8_4.InServiceOfYalahar.Mission07", 4);
      }
      return;
    }
    if (event === "BragrumolDeath") {
      this.replaceWhen(damagers, "Quest.U12_20.KilmareshQuest.Twelve.Bragrumol", 1, 2);
      return;
    }
    if (event === "MozradekDeath") {
      this.replaceWhen(damagers, "Quest.U12_20.KilmareshQuest.Twelve.Mozradek", 1, 2);
      return;
    }
    if (event === "XogixathDeath") {
      this.replaceWhen(damagers, "Quest.U12_20.KilmareshQuest.Twelve.Xogixath", 1, 2);
      return;
    }
    if (event === "FafnarMissionsDeath") {
      const key = "Quest.U12_20.KilmareshQuest.Thirteen.Fafnar";
      for (const player of party) this.set(player, key, player.storageValue(key) + 1);
      return;
    }
    if (event === "DeeplingBossDeath") {
      const values: Readonly<Record<string, readonly [number, string]>> = {
        jaul: [2, "DeeplingBosses.Jaul"],
        tanjis: [3, "DeeplingBosses.Tanjis"],
        obujos: [4, "DeeplingBosses.Obujos"],
      };
      const value = values[name];
      if (!value) return;
      for (const player of damagers) {
        const status = "DeeplingBosses.DeeplingStatus";
        if (player.storageValue(status) < value[0]) this.set(player, status, value[0]);
        this.set(player, value[1], 1);
      }
      return;
    }
    if (event === "RoshamuulKillsDeath") {
      const key = name === "frazzlemaw"
        ? "ROSHAMUUL_KILLED_FRAZZLEMAWS"
        : name === "silencer"
          ? "ROSHAMUUL_KILLED_SILENCERS"
          : null;
      if (!key) return;
      for (const player of party) this.set(player, key, Math.max(0, player.storageValue(key)) + 1);
      return;
    }
    if (event === "BlackKnightDeath") {
      this.replaceWhen(damagers, "Quest.U8_1.SecretService.AVINMission04", 1, 2);
      return;
    }
    if (event === "LowerSpikeDeath") {
      this.incrementSpike(monster, party, "Quest.U10_20.SpikeTaskQuest.Spike_Lower_Kill_Main", { x: 32_120, y: 32_470, z: 13 }, { x: 32_345, y: 32_710, z: 15 });
      return;
    }
    if (event === "MiddleSpikeDeath") {
      this.incrementSpike(monster, party, "Quest.U10_20.SpikeTaskQuest.Spike_Middle_Kill_Main", { x: 32_100, y: 32_470, z: 11 }, { x: 32_380, y: 32_725, z: 12 });
      return;
    }
    if (event === "UpperSpikeDeath") {
      this.incrementSpike(monster, party, "Quest.U10_20.SpikeTaskQuest.Spike_Upper_Kill_Main", { x: 32_008, y: 32_522, z: 8 }, { x: 32_365, y: 32_759, z: 10 });
      return;
    }
    if (event === "TheFirstDragonDragonTaskDeath") {
      this.incrementInRange(party, "Quest.U11_02.TheFirstDragon.DragonCounter", 0, 199);
      return;
    }
    if (event === "TheGreatDragonHuntDeath") {
      const areas: ReadonlyArray<readonly [Position, Position]> = [
        [{ x: 33_061, y: 32_646, z: 6 }, { x: 33_081, y: 32_665, z: 6 }],
        [{ x: 33_027, y: 32_634, z: 7 }, { x: 33_081, y: 32_658, z: 7 }],
        [{ x: 32_983, y: 32_616, z: 7 }, { x: 33_026, y: 32_631, z: 7 }],
        [{ x: 33_007, y: 32_612, z: 6 }, { x: 33_020, y: 32_623, z: 6 }],
        [{ x: 32_987, y: 32_621, z: 6 }, { x: 33_043, y: 32_661, z: 6 }],
        [{ x: 33_002, y: 32_614, z: 5 }, { x: 33_023, y: 32_642, z: 5 }],
        [{ x: 32_993, y: 32_632, z: 7 }, { x: 33_042, y: 32_688, z: 7 }],
      ];
      if (!areas.some(([from, to]) => this.inRange(monster.position, from, to))) return;
      const key = "Quest.U10_80.TheGreatDragonHunt.DragonCounter";
      for (const player of party) this.set(player, key, Math.max(0, player.storageValue(key)) + 1);
      return;
    }
    if (event === "HuskyDeath") {
      const key = "Quest.U8_0.TheIceIslands.HuskyKill";
      for (const player of damagers) this.set(player, key, player.storageValue(key) + 1);
      return;
    }
    if (event === "UngreezDeath" && mostDamagePlayer) {
      const quest = "Quest.U8_2.TheInquisitionQuest.Questline";
      if (mostDamagePlayer.storageValue(quest) === 18) {
        this.set(mostDamagePlayer, "Quest.U8_2.TheInquisitionQuest.Mission06", 2);
        this.set(mostDamagePlayer, quest, 19);
      }
      return;
    }
    if (event === "ShardOfCorruptionDeath") {
      this.replaceWhen(damagers, "Quest.U8_54.TheNewFrontier.Questline", 11, 12);
      return;
    }
    if (event === "RationalRequestRatDeath") {
      this.incrementWhen(party, "Quest.U9_1.TheRookieGuard.RatKills", 5, "Quest.U9_1.TheRookieGuard.Mission03", 1);
      return;
    }
    if (event === "killingLibrary") {
      const values: Readonly<Record<string, readonly [string, number, string?]>> = {
        "grand commander soeren": ["Quest.U11_80.TheSecretLibrary.FalconBastion.KillingBosses", 1],
        "preceptor lazare": ["Quest.U11_80.TheSecretLibrary.FalconBastion.KillingBosses", 2],
        "grand chaplain gaunder": ["Quest.U11_80.TheSecretLibrary.FalconBastion.KillingBosses", 3],
        "grand canon dominus": ["Quest.U11_80.TheSecretLibrary.FalconBastion.KillingBosses", 4],
        "dazed leaf golem": ["Quest.U11_80.TheSecretLibrary.FalconBastion.KillingBosses", 5],
        "grand master oberon": ["Quest.U11_80.TheSecretLibrary.FalconBastion.KillingBosses", 6, "Quest.U11_80.TheSecretLibrary.FalconBastion.Questline"],
        brokul: ["Quest.U11_80.TheSecretLibrary.LiquidDeath.Questline", 7],
        "the flaming orchid": ["Quest.U11_80.TheSecretLibrary.Asuras.FlammingOrchid", 1],
      };
      const value = values[name];
      if (!value) return;
      for (const player of damagers) {
        if (player.storageValue(value[0]) < value[1]) this.set(player, value[0], value[1]);
        if (value[2] && player.storageValue(value[2]) < 2) this.set(player, value[2], 2);
      }
      return;
    }
    if (event === "NomadDeath") {
      this.replaceWhen(party, "Quest.U8_2.TheThievesGuildQuest.Mission04", 3, 4);
      return;
    }
    if (event === "ThreatenedDreamsNightmareMonstersDeath") {
      for (const player of party) {
        if (player.storageValue("Quest.U11_40.ThreatenedDreams.Mission02.1") !== 1) continue;
        const key = name === "enfeebled silencer"
          ? "Quest.U11_40.ThreatenedDreams.Mission02.EnfeebledCount"
          : name === "weakened frazzlemaw"
            ? "Quest.U11_40.ThreatenedDreams.Mission02.FrazzlemawsCount"
            : name === "kroazur"
              ? "Quest.U11_40.ThreatenedDreams.Mission02.KroazurKill"
              : null;
        if (!key) continue;
        this.set(player, key, name === "kroazur" ? 1 : player.storageValue(key) + 1);
      }
      return;
    }
    if (event === "GoblinLeaderDeath") {
      this.replaceWhen(damagers, "Quest.U8_1.TowerDefenceQuest.Questline", 2, 3);
      return;
    }
    if (event === "LizardMagistratusDeath") {
      this.incrementFromOne(party, "Quest.U8_6.WrathOfTheEmperor.Mission06", 5);
      return;
    }
    if (event === "LizardNobleDeath") {
      this.incrementFromOne(party, "Quest.U8_6.WrathOfTheEmperor.Mission07", 6);
      return;
    }
    if (event === "HazardousPhantomDeath") {
      const key = "SoulWar.hazardous-phantom-death";
      for (const player of damagers) {
        const value = Math.max(0, player.storageValue(key));
        if (value < 20) this.set(player, key, value + 1);
      }
      return;
    }
    if (event === "YielothaxDeath") {
      const key = "673003";
      this.worldStorage.set(key, (this.worldStorage.get(key) ?? -1) + 1);
      return;
    }
    if (event === "EnergizedRagingMageDeath") {
      const key = "673003";
      if ((this.worldStorage.get(key) ?? -1) < 2_000) return;
      this.queueSpawn("raging-mage", monster.position, now);
      this.worldStorage.set(key, 0);
      return;
    }
    if (event === "InquisitionBossDeath") {
      const storages: Readonly<Record<string, string>> = {
        ushuriel: "200",
        zugurosh: "201",
        madareth: "202",
        latrivan: "203",
        golgordan: "203",
        annihilon: "204",
        hellgorak: "205",
      };
      const key = storages[name];
      if (!key) return;
      const value = name === "latrivan" || name === "golgordan"
        ? Math.max(0, this.worldStorage.get(key) ?? -1) + 1
        : 2;
      this.worldStorage.set(key, value);
      if (value === 2) {
        this.scheduledStorage.push({ executeAt: now + 600_000, key, value: 0 });
      }
      return;
    }
    if (event === "WhiteDeerDeath") {
      this.queueSpawn(
        this.randomInteger(1, 100) <= 30
          ? "enraged-white-deer"
          : "desperate-white-deer",
        monster.position,
        now,
      );
      return;
    }
    if (event === "WhiteDeerScoutsDeath") {
      if (this.randomInteger(1, 100) > 10) return;
      this.queueSpawn("elf-scout", monster.position, now);
      this.queueSpawn("elf-scout", monster.position, now);
      return;
    }
    if (event === "ZalamonDeath") {
      if (name === "mutated zalamon") {
        this.worldStorage.set("Quest.U8_6.WrathOfTheEmperor.Mission11", -1);
        return;
      }
      const next: Readonly<Record<string, string>> = {
        "snake god essence": "snake-thing",
        "snake thing": "lizard-abomination",
        "lizard abomination": "mutated-zalamon",
      };
      const typeId = next[name];
      if (!typeId) return;
      const nextName = typeId.replaceAll("-", " ");
      const alreadySpawned = this.world
        .creaturesNear(monster.position, { x: 9, y: 7 })
        .some((creature) => creature.name.toLowerCase() === nextName);
      if (!alreadySpawned) this.queueSpawn(typeId, monster.position, now);
      return;
    }
    if (event === "BoneCapsule") {
      this.queueSpawn("bone-capsule", { x: 33_485, y: 32_333, z: 14 }, now);
      const ragiaz = this.world
        .creaturesAt({ x: 33_487, y: 32_333, z: 14 })
        .find((creature) => creature.name.toLowerCase() === "ragiaz");
      if (!ragiaz) return;
      const from = this.world.relocateCreature(ragiaz, monster.position);
      ragiaz.setHealth(
        ragiaz.health + this.randomInteger(25_000, 35_000),
      );
      this.visibility.onCreatureStepped(ragiaz, from, 0);
      this.visibility.broadcastHealth(ragiaz);
    }
  }

  private queueSpawn(typeId: string, position: Position, now: number): void {
    this.scheduledSpawns.push({
      executeAt: now,
      typeId,
      position: { ...position },
    });
  }

  private eventId(prefix: string, monster: Monster, now: number): string {
    return `${prefix}:${monster.id}:${now}:${this.randomInteger(0, 1_000_000)}`;
  }

  private isInSoulWarZone(position: Position): boolean {
    const areas: ReadonlyArray<readonly [Position, Position]> = [
      [{ x: 33_982, y: 30_981, z: 9 }, { x: 34_051, y: 31_110, z: 11 }],
      [{ x: 33_873, y: 30_994, z: 8 }, { x: 33_968, y: 31_150, z: 9 }],
      [{ x: 33_814, y: 31_819, z: 3 }, { x: 33_907, y: 31_920, z: 7 }],
      [{ x: 33_901, y: 30_986, z: 11 }, { x: 33_980, y: 31_105, z: 12 }],
      [{ x: 33_877, y: 31_164, z: 9 }, { x: 33_991, y: 31_241, z: 13 }],
    ];
    const excluded: ReadonlyArray<readonly [Position, Position]> = [
      [{ x: 34_002, y: 31_008, z: 9 }, { x: 34_019, y: 31_019, z: 9 }],
      [{ x: 33_887, y: 31_015, z: 8 }, { x: 33_920, y: 31_024, z: 8 }],
      [{ x: 33_854, y: 31_828, z: 3 }, { x: 33_869, y: 31_834, z: 3 }],
      [{ x: 33_967, y: 31_037, z: 11 }, { x: 33_977, y: 31_051, z: 11 }],
      [{ x: 33_884, y: 31_181, z: 10 }, { x: 33_892, y: 31_198, z: 10 }],
    ];
    return (
      areas.some(([from, to]) => this.inRange(position, from, to)) &&
      !excluded.some(([from, to]) => this.inRange(position, from, to))
    );
  }

  private randomInteger(minimum: number, maximum: number): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0 || 0x9e3779b9;
    return minimum + Math.floor(
      (this.randomState / 0x1_0000_0000) * (maximum - minimum + 1),
    );
  }

  private replaceWhen(
    players: ReadonlyArray<Player>,
    key: string,
    current: number,
    next: number,
  ): void {
    for (const player of players) {
      if (player.storageValue(key) === current) this.set(player, key, next);
    }
  }

  private incrementWhen(
    players: ReadonlyArray<Player>,
    key: string,
    maximum: number,
    prerequisiteKey: string,
    prerequisiteValue: number,
  ): void {
    for (const player of players) {
      const value = player.storageValue(key);
      if (value < maximum && player.storageValue(prerequisiteKey) === prerequisiteValue) {
        this.set(player, key, value + 1);
      }
    }
  }

  private incrementInRange(
    players: ReadonlyArray<Player>,
    key: string,
    minimum: number,
    maximum: number,
  ): void {
    for (const player of players) {
      const value = player.storageValue(key);
      if (value >= minimum && value <= maximum) this.set(player, key, value + 1);
    }
  }

  private incrementFromOne(
    players: ReadonlyArray<Player>,
    key: string,
    maximum: number,
  ): void {
    for (const player of players) {
      const value = player.storageValue(key);
      if (value >= 0 && value < maximum) this.set(player, key, Math.max(1, value) + 1);
    }
  }

  private incrementSpike(
    monster: Monster,
    players: ReadonlyArray<Player>,
    key: string,
    from: Position,
    to: Position,
  ): void {
    if (!this.inRange(monster.position, from, to)) return;
    for (const player of players) {
      const value = player.storageValue(key);
      if (value !== -1 && value !== 7) this.set(player, key, value + 1);
    }
  }

  private inRange(position: Position, from: Position, to: Position): boolean {
    return (
      position.x >= from.x &&
      position.x <= to.x &&
      position.y >= from.y &&
      position.y <= to.y &&
      position.z >= from.z &&
      position.z <= to.z
    );
  }

  private distance(left: Position, right: Position): number {
    if (left.z !== right.z) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
  }

  private set(player: Player, key: string, value: number): void {
    if (player.storageValue(key) === value) return;
    player.setStorageValue(key, value);
    this.persistence.markDirty(player);
  }
}
