import {
  serverMessageSchema,
  type ChatSpeechMode,
  type CreateCharacterInput,
  type ClientMessage,
  type CombatTarget,
  type Direction,
  type DepotItemEntry,
  type DepotLocation,
  type DepotStateMessage,
  type FightMode,
  type GemAction,
  type HighscoreCategory,
  type CharacterVocation,
  type InventoryItem,
  type ItemContainerDestination,
  type Language,
  type MarketSide,
  type Position,
  type ReportReason,
  type ServerErrorCode,
  type ServerMessage,
  type ActionBar,
  type AutoPotionSettings,
  type PotionActionBar,
  type UiSettings,
  type ViewRange,
} from "@tibia/protocol";
import type { PendingItemOpIntent } from "../inventory/PendingItemOp";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface GameClientHandlers {
  onMessage(message: ServerMessage): void;
  onStatus(status: ConnectionStatus): void;
  onLanguage(language: Language): void;
  onError(code: ServerErrorCode): void;
}

export class GameClient {
  private socket: WebSocket | null = null;
  private authenticated = false;
  private viewRange: ViewRange | null = null;
  private ownPlayerId: string | null = null;
  private positionRevision = 0;

  constructor(
    private readonly url: string,
    private readonly handlers: GameClientHandlers,
  ) {}

  /** Opens the socket and authenticates; world entry requires a character id. */
  connect(accessToken: string, language: Language): void {
    this.handlers.onStatus("connecting");
    const socket = new WebSocket(this.url);
    socket.onopen = () => {
      this.handlers.onStatus("connected");
      this.send({ type: "auth", token: accessToken, language });
    };
    socket.onmessage = (event) => this.onMessage(event.data);
    socket.onclose = () => this.handlers.onStatus("disconnected");
    this.socket = socket;
  }

  sendMove(direction: Direction, queueStep = true): void {
    this.send({ type: "move", direction, queueStep });
  }

  stopMoving(): void {
    this.send({ type: "stop-move" });
  }

  autoWalk(directions: ReadonlyArray<Direction>): boolean {
    if (directions.length === 0) return false;
    return this.send({
      type: "auto-walk",
      positionRevision: this.positionRevision,
      directions: [...directions],
    });
  }

  setViewport(range: ViewRange): void {
    if (
      this.viewRange &&
      range.x === this.viewRange.x &&
      range.y === this.viewRange.y
    ) {
      return;
    }
    this.viewRange = { ...range };
    if (this.authenticated) {
      this.send({ type: "set-viewport", range: this.viewRange });
    }
  }

  useMap(position: Position): void {
    this.send({ type: "use-map", position });
  }

  attackTarget(creatureId: string): void {
    this.send({ type: "attack-target", creatureId });
  }

  cancelAttack(): void {
    this.send({ type: "cancel-attack" });
  }

  setFightMode(mode: FightMode): boolean {
    return this.send({ type: "set-fight-mode", mode });
  }

  castSpell(spellId: string, target: CombatTarget): boolean {
    return this.send({ type: "cast-spell", spellId, target });
  }

  useRune(item: InventoryItem, target: CombatTarget): boolean {
    return this.send({
      type: "use-rune",
      itemId: item.id,
      revision: item.revision,
      target,
    });
  }

  usePotion(item: InventoryItem, targetPlayerId: string): boolean {
    return this.send({
      type: "use-potion",
      itemId: item.id,
      revision: item.revision,
      targetPlayerId,
    });
  }

  /** Sends a pre-built item drag intent (see useOptimisticInventory). */
  sendItemIntent(intent: PendingItemOpIntent): boolean {
    return this.send(intent);
  }

  openContainer(item: InventoryItem): boolean {
    return this.send({
      type: "open-container",
      itemId: item.id,
      revision: item.revision,
    });
  }

  closeContainer(containerId: string): boolean {
    return this.send({ type: "close-container", containerId });
  }

  lootItem(
    item: InventoryItem,
    containerId: string,
    destination?: ItemContainerDestination,
  ): boolean {
    return this.send({
      type: "loot-item",
      itemId: item.id,
      revision: item.revision,
      containerId,
      ...(destination ? { destination } : {}),
    });
  }

  closeWorldContainer(containerId: string): boolean {
    return this.send({ type: "close-world-container", containerId });
  }

  useItem(item: InventoryItem): boolean {
    return this.send({
      type: "use-item",
      itemId: item.id,
      revision: item.revision,
    });
  }

  useItemWith(item: InventoryItem, targetPosition: Position): boolean {
    return this.send({
      type: "use-item-with",
      itemId: item.id,
      revision: item.revision,
      targetPosition,
    });
  }

  writeItem(itemId: string, revision: number, text: string): boolean {
    return this.send({
      type: "write-item",
      itemId,
      revision,
      text,
    });
  }

  speak(mode: ChatSpeechMode, text: string): boolean {
    return this.send({ type: "speak", mode, text });
  }

  sendPrivateChat(to: string, text: string): boolean {
    return this.send({ type: "private-chat", to, text });
  }

  sendNpcDialogueChoice(
    npcId: string,
    conversationId: string,
    choiceId: string,
  ): boolean {
    return this.send({
      type: "npc-dialogue-choice",
      npcId,
      conversationId,
      choiceId,
    });
  }

  bankDeposit(npcId: string, amount: number): boolean {
    return this.send({ type: "bank-deposit", npcId, amount });
  }

  bankWithdraw(npcId: string, amount: number): boolean {
    return this.send({ type: "bank-withdraw", npcId, amount });
  }

  bankTransfer(
    npcId: string,
    toCharacterName: string,
    amount: number,
  ): boolean {
    return this.send({
      type: "bank-transfer",
      npcId,
      toCharacterName,
      amount,
    });
  }

  shopBuy(
    npcId: string,
    shopSessionId: string,
    offerId: string,
    amount: number,
  ): boolean {
    return this.send({
      type: "shop-buy",
      npcId,
      shopSessionId,
      offerId,
      amount,
    });
  }

  shopSell(
    npcId: string,
    shopSessionId: string,
    offerId: string,
    amount: number,
  ): boolean {
    return this.send({
      type: "shop-sell",
      npcId,
      shopSessionId,
      offerId,
      amount,
    });
  }

  browseDepot(
    state: DepotStateMessage,
    location: DepotLocation,
    page: number,
    query: string,
  ): boolean {
    return this.send({
      type: "depot-browse",
      sessionId: state.sessionId,
      location,
      page,
      query,
    });
  }

  depositInDepot(state: DepotStateMessage, item: InventoryItem): boolean {
    return this.send({
      type: "depot-deposit",
      sessionId: state.sessionId,
      depotRevision: state.depotRevision,
      itemId: item.id,
      itemRevision: item.revision,
    });
  }

  withdrawFromDepot(
    state: DepotStateMessage,
    item: DepotItemEntry,
  ): boolean {
    return this.send({
      type: "depot-withdraw",
      sessionId: state.sessionId,
      source: item.location,
      sourceRevision:
        item.location === "depot"
          ? state.depotRevision
          : state.inboxRevision,
      itemId: item.itemId,
      itemRevision: item.revision,
    });
  }

  depositInStash(
    state: DepotStateMessage,
    item: InventoryItem,
    count: number,
  ): boolean {
    return this.send({
      type: "stash-deposit",
      sessionId: state.sessionId,
      stashRevision: state.stashRevision,
      itemId: item.id,
      itemRevision: item.revision,
      count,
    });
  }

  withdrawFromStash(
    state: DepotStateMessage,
    itemTypeId: number,
    count: number,
  ): boolean {
    return this.send({
      type: "stash-withdraw",
      sessionId: state.sessionId,
      stashRevision: state.stashRevision,
      itemTypeId,
      count,
    });
  }

  closeDepot(sessionId: string): boolean {
    return this.send({ type: "close-depot", sessionId });
  }

  openMarket(page: number): boolean {
    return this.send({ type: "market-open", page });
  }

  browseMarket(itemTypeId: number): boolean {
    return this.send({ type: "market-browse", itemTypeId });
  }

  createMarketOffer(
    requestId: string,
    side: MarketSide,
    itemTypeId: number,
    amount: number,
    unitPrice: number,
  ): boolean {
    return this.send({
      type: "market-create-offer",
      requestId,
      side,
      itemTypeId,
      amount,
      unitPrice,
    });
  }

  acceptMarketOffer(
    requestId: string,
    offerId: string,
    amount: number,
  ): boolean {
    return this.send({
      type: "market-accept-offer",
      requestId,
      offerId,
      amount,
    });
  }

  cancelMarketOffer(requestId: string, offerId: string): boolean {
    return this.send({
      type: "market-cancel-offer",
      requestId,
      offerId,
    });
  }

  requestTrade(
    targetPlayerId: string,
    itemId: string,
    revision: number,
  ): boolean {
    return this.send({
      type: "trade-request",
      targetPlayerId,
      itemId,
      revision,
    });
  }

  acceptTrade(): boolean {
    return this.send({ type: "trade-accept" });
  }

  cancelTrade(): boolean {
    return this.send({ type: "trade-cancel" });
  }

  inviteToParty(targetName: string): boolean {
    return this.send({ type: "party-invite", targetName });
  }

  respondToPartyInvite(leaderId: string, accept: boolean): boolean {
    return this.send({ type: "party-respond-invite", leaderId, accept });
  }

  revokePartyInvite(targetPlayerId: string): boolean {
    return this.send({ type: "party-revoke-invite", targetPlayerId });
  }

  leaveParty(): boolean {
    return this.send({ type: "party-leave" });
  }

  kickFromParty(targetPlayerId: string): boolean {
    return this.send({ type: "party-kick", targetPlayerId });
  }

  passPartyLeadership(targetPlayerId: string): boolean {
    return this.send({ type: "party-pass-leadership", targetPlayerId });
  }

  setPartySharedExp(enabled: boolean): boolean {
    return this.send({ type: "party-set-shared-exp", enabled });
  }

  sendPartyChat(text: string): boolean {
    return this.send({ type: "party-chat", text });
  }

  createGuild(name: string): boolean {
    return this.send({ type: "guild-create", name });
  }

  inviteToGuild(targetName: string): boolean {
    return this.send({ type: "guild-invite", targetName });
  }

  respondToGuildInvite(guildId: string, accept: boolean): boolean {
    return this.send({ type: "guild-respond-invite", guildId, accept });
  }

  revokeGuildInvite(targetCharacterId: string): boolean {
    return this.send({ type: "guild-revoke-invite", targetCharacterId });
  }

  kickFromGuild(targetCharacterId: string): boolean {
    return this.send({ type: "guild-kick", targetCharacterId });
  }

  leaveGuild(): boolean {
    return this.send({ type: "guild-leave" });
  }

  promoteGuildMember(targetCharacterId: string): boolean {
    return this.send({ type: "guild-promote", targetCharacterId });
  }

  demoteGuildMember(targetCharacterId: string): boolean {
    return this.send({ type: "guild-demote", targetCharacterId });
  }

  passGuildLeadership(targetCharacterId: string): boolean {
    return this.send({ type: "guild-pass-leadership", targetCharacterId });
  }

  disbandGuild(): boolean {
    return this.send({ type: "guild-disband" });
  }

  setGuildMotd(motd: string): boolean {
    return this.send({ type: "guild-set-motd", motd });
  }

  setGuildNick(targetCharacterId: string, nick: string): boolean {
    return this.send({ type: "guild-set-nick", targetCharacterId, nick });
  }

  setGuildRankName(level: number, name: string): boolean {
    return this.send({ type: "guild-set-rank-name", level, name });
  }

  openGuild(): boolean {
    return this.send({ type: "guild-open" });
  }

  sendGuildChat(text: string): boolean {
    return this.send({ type: "guild-chat", text });
  }

  declareGuildWar(targetGuildName: string, fragLimit: number): boolean {
    return this.send({ type: "guild-declare-war", targetGuildName, fragLimit });
  }

  respondToGuildWar(warId: string, accept: boolean): boolean {
    return this.send({ type: "guild-respond-war", warId, accept });
  }

  endGuildWar(warId: string): boolean {
    return this.send({ type: "guild-end-war", warId });
  }

  openHouse(houseId?: number): boolean {
    return this.send({
      type: "house-open",
      ...(houseId !== undefined ? { houseId } : {}),
    });
  }

  buyHouse(houseId: number): boolean {
    return this.send({ type: "house-buy", houseId });
  }

  abandonHouse(): boolean {
    return this.send({ type: "house-abandon" });
  }

  offerHouseTransfer(targetName: string, price: number): boolean {
    return this.send({ type: "house-transfer-offer", targetName, price });
  }

  respondToHouseTransfer(houseId: number, accept: boolean): boolean {
    return this.send({ type: "house-transfer-respond", houseId, accept });
  }

  cancelHouseTransfer(): boolean {
    return this.send({ type: "house-transfer-cancel" });
  }

  setHouseAccess(
    kind: "guest" | "subowner",
    targetName: string,
    grant: boolean,
  ): boolean {
    return this.send({ type: "house-set-access", kind, targetName, grant });
  }

  kickFromHouse(targetCharacterId?: string): boolean {
    return this.send({
      type: "house-kick",
      ...(targetCharacterId !== undefined ? { targetCharacterId } : {}),
    });
  }

  browseHouses(townId?: number, page?: number): boolean {
    return this.send({
      type: "house-browse",
      ...(townId !== undefined ? { townId } : {}),
      ...(page !== undefined ? { page } : {}),
    });
  }

  addVip(name: string): boolean {
    return this.send({ type: "vip-add", name });
  }

  removeVip(targetCharacterId: string): boolean {
    return this.send({ type: "vip-remove", targetCharacterId });
  }

  editVip(
    targetCharacterId: string,
    edits: { description?: string; icon?: number; notifyLogin?: boolean },
  ): boolean {
    return this.send({
      type: "vip-edit",
      targetCharacterId,
      ...(edits.description !== undefined
        ? { description: edits.description }
        : {}),
      ...(edits.icon !== undefined ? { icon: edits.icon } : {}),
      ...(edits.notifyLogin !== undefined
        ? { notifyLogin: edits.notifyLogin }
        : {}),
    });
  }

  requestBestiaryCreatures(): boolean {
    return this.send({ type: "bestiary-creatures-get" });
  }

  requestBestiaryMonster(raceId: number): boolean {
    return this.send({ type: "bestiary-monster-get", raceId });
  }

  requestBosstiary(): boolean {
    return this.send({ type: "bosstiary-get" });
  }

  requestBosstiaryBoss(raceId: number): boolean {
    return this.send({ type: "bosstiary-boss-get", raceId });
  }

  requestWikiItemSources(itemTypeId: number): boolean {
    return this.send({ type: "wiki-item-sources-get", itemTypeId });
  }

  requestWheel(): boolean {
    return this.send({ type: "wheel-get" });
  }

  saveWheel(requestId: string, slices: ReadonlyArray<number>): boolean {
    return this.send({ type: "wheel-save", requestId, slices: [...slices] });
  }

  requestGems(): boolean {
    return this.send({ type: "wheel-gems-get" });
  }

  sendGemAction(requestId: string, action: GemAction): boolean {
    return this.send({ type: "wheel-gem-action", requestId, action });
  }

  requestHighscores(
    category: HighscoreCategory,
    vocation: CharacterVocation | undefined,
    page: number,
  ): boolean {
    return this.send({
      type: "highscores-get",
      category,
      ...(vocation !== undefined ? { vocation } : {}),
      page,
    });
  }

  reportPlayer(
    targetName: string,
    reason: ReportReason,
    comment: string,
  ): boolean {
    return this.send({ type: "report-player", targetName, reason, comment });
  }

  requestMarketOwnOffers(): boolean {
    return this.send({ type: "market-own-offers" });
  }

  requestMarketOwnHistory(): boolean {
    return this.send({ type: "market-own-history" });
  }

  sendMail(
    sessionId: string,
    item: InventoryItem,
    recipientName: string,
  ): boolean {
    return this.send({
      type: "send-mail",
      sessionId,
      requestId: crypto.randomUUID(),
      itemId: item.id,
      itemRevision: item.revision,
      recipientName,
    });
  }

  closeMailbox(sessionId: string): boolean {
    return this.send({ type: "close-mailbox", sessionId });
  }

  createCharacter(input: CreateCharacterInput): boolean {
    return this.send({ type: "create-character", ...input });
  }

  selectCharacter(characterId: string): boolean {
    return this.send({ type: "select-character", characterId });
  }

  updateLanguage(language: Language): boolean {
    return this.send({ type: "set-language", language });
  }

  updateUiSettings(settings: UiSettings): boolean {
    return this.send({ type: "update-ui-settings", settings });
  }

  updateActionBar(actionBar: ActionBar): boolean {
    return this.send({ type: "update-action-bar", actionBar });
  }

  updatePotionActionBar(potionActionBar: PotionActionBar): boolean {
    return this.send({
      type: "update-potion-action-bar",
      potionActionBar,
    });
  }

  updateAutoPotionSettings(settings: AutoPotionSettings): boolean {
    return this.send({
      type: "update-auto-potion-settings",
      settings,
    });
  }

  disconnect(): void {
    this.authenticated = false;
    this.ownPlayerId = null;
    this.positionRevision = 0;
    this.socket?.close();
    this.socket = null;
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const result = serverMessageSchema.safeParse(json);
    if (!result.success) return;
    if (result.data.type === "auth-ok") {
      this.authenticated = true;
      this.handlers.onLanguage(result.data.language);
      if (this.viewRange) {
        this.send({ type: "set-viewport", range: this.viewRange });
      }
      this.send({ type: "list-characters" });
      return;
    }
    if (result.data.type === "language-updated") {
      this.handlers.onLanguage(result.data.language);
      return;
    }
    if (result.data.type === "welcome") {
      const playerId = result.data.playerId;
      this.ownPlayerId = playerId;
      const own = result.data.creatures.find(
        (creature) => creature.id === playerId,
      );
      this.positionRevision = own?.positionRevision ?? 0;
    }
    if (
      result.data.type === "creature-moved" &&
      result.data.creatureId === this.ownPlayerId
    ) {
      this.positionRevision = result.data.positionRevision;
    }
    if (
      result.data.type === "position-correction" &&
      result.data.playerId === this.ownPlayerId
    ) {
      this.positionRevision = result.data.positionRevision;
    }
    if (result.data.type === "error") {
      this.handlers.onError(result.data.code);
      return;
    }
    this.handlers.onMessage(result.data);
  }

  private send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
}
