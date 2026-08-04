import {
  parseServerMessages,
  type BugReportMessage,
  type ChatChannelId,
  type ChatSpeechMode,
  type CreateCharacterInput,
  type ClientMessage,
  type CombatTarget,
  type CyclopediaView,
  type Direction,
  type DepotItemEntry,
  type DepotLocation,
  type DepotStateMessage,
  type FightMode,
  type ForgeConversionMessage,
  type ForgeFusionMessage,
  type ForgeTransferMessage,
  type GemAction,
  type HighscoreCategory,
  type HouseListKind,
  type CharacterVocation,
  type InventoryItem,
  type ItemContainerDestination,
  type QuickLootFilter,
  type Language,
  type LookTarget,
  type MarketSide,
  type DailyRewardPick,
  type OutfitSelectMessage,
  type PodiumSetMessage,
  type PartyAnalyzerPriceMode,
  type Position,
  type PreyActionMessage,
  type PreyOption,
  type ProficiencySelection,
  type ReportReason,
  type TaskHuntingActionMessage,
  type TrackerSetMessage,
  type ServerErrorCode,
  type ServerMessage,
  type ActionBar,
  type ActionBotSettings,
  type HuntingBotRoute,
  type LootFilter,
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

  /** Latency probe; the pong echoes this send's timestamp as its nonce. */
  ping(): void {
    this.send({ type: "ping", nonce: Date.now() });
  }

  sendMove(direction: Direction, queueStep = true): void {
    this.send({ type: "move", direction, queueStep });
  }

  turn(direction: Direction): void {
    this.send({ type: "turn", direction });
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

  /** Left+right click or the map menu's "Look": the server writes the text. */
  look(target: LookTarget): void {
    this.send({ type: "look", target });
  }

  attackTarget(creatureId: string): void {
    this.send({ type: "attack-target", creatureId });
  }

  cancelAttack(): void {
    this.send({ type: "cancel-attack" });
  }

  followCreature(creatureId: string): void {
    this.send({ type: "follow-creature", creatureId });
  }

  cancelFollow(): void {
    this.send({ type: "cancel-follow" });
  }

  resetCombatAnalyzer(): void {
    this.send({ type: "reset-combat-analyzer" });
  }

  greetNpc(npcId: string): boolean {
    return this.send({ type: "npc-dialogue-greet", npcId });
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

  activateActionBar(slotIndex: number, target?: CombatTarget): boolean {
    return this.send({
      type: "activate-action-bar",
      slotIndex,
      ...(target ? { target } : {}),
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

  /** Browses a container nested inside an already-open world container. */
  openWorldContainer(item: InventoryItem): boolean {
    return this.send({
      type: "open-world-container",
      containerId: item.id,
      revision: item.revision,
    });
  }

  /** Sweeps an open world container; the server owns what is eligible. */
  quickLoot(containerId: string, category?: QuickLootFilter): boolean {
    return this.send({
      type: "quick-loot",
      containerId,
      ...(category ? { category } : {}),
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

  advertiseParty(advert: {
    title?: string;
    minLevel?: number;
    maxLevel?: number;
  }): boolean {
    return this.send({ type: "party-finder-advertise", ...advert });
  }

  listPartyFinder(forOwnLevel: boolean): boolean {
    return this.send({ type: "party-finder-list", forOwnLevel });
  }

  resetPartyAnalyzer(): boolean {
    return this.send({ type: "party-reset-analyzer" });
  }

  setPartyAnalyzerPriceMode(mode: PartyAnalyzerPriceMode): boolean {
    return this.send({ type: "party-set-analyzer-price-mode", mode });
  }

  writeItem(itemId: string, revision: number, text: string): boolean {
    return this.send({
      type: "write-item",
      itemId,
      revision,
      text,
    });
  }

  writeMapItem(
    itemId: string,
    revision: number,
    position: Position,
    text: string,
  ): boolean {
    return this.send({
      type: "write-map-item",
      itemId,
      revision,
      position,
      text,
    });
  }

  speak(mode: ChatSpeechMode, text: string): boolean {
    return this.send({ type: "speak", mode, text });
  }

  sendPrivateChat(to: string, text: string): boolean {
    return this.send({ type: "private-chat", to, text });
  }

  /** Asks for the public channels this character may open. */
  requestChannelList(): boolean {
    return this.send({ type: "channel-list-get" });
  }

  openChannel(channelId: ChatChannelId): boolean {
    return this.send({ type: "channel-open", channelId });
  }

  closeChannel(channelId: ChatChannelId): boolean {
    return this.send({ type: "channel-close", channelId });
  }

  sendChannelChat(channelId: ChatChannelId, text: string): boolean {
    return this.send({ type: "channel-speak", channelId, text });
  }

  ignoreName(name: string): boolean {
    return this.send({ type: "ignore-add", name });
  }

  unignoreName(name: string): boolean {
    return this.send({ type: "ignore-remove", name });
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

  bidOnHouse(houseId: number, amount: number): boolean {
    return this.send({ type: "house-bid", houseId, amount });
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

  walkTo(position: Position): boolean {
    return this.send({ type: "walk-to", position });
  }

  setMapMarker(position: Position, icon: number, text: string): boolean {
    return this.send({ type: "minimap-marker-set", position, icon, text });
  }

  deleteMapMarker(position: Position): boolean {
    return this.send({ type: "minimap-marker-delete", position });
  }

  createVipGroup(name: string): boolean {
    return this.send({ type: "vip-group-create", name });
  }

  deleteVipGroup(groupId: string): boolean {
    return this.send({ type: "vip-group-delete", groupId });
  }

  assignVipGroup(targetCharacterId: string, groupId: string | null): boolean {
    return this.send({ type: "vip-assign-group", targetCharacterId, groupId });
  }

  requestFriend(name: string): boolean {
    return this.send({ type: "friend-request", name });
  }

  respondToFriendRequest(fromCharacterId: string, accept: boolean): boolean {
    return this.send({ type: "friend-respond", fromCharacterId, accept });
  }

  removeFriend(targetCharacterId: string): boolean {
    return this.send({ type: "friend-remove", targetCharacterId });
  }

  setSocialSettings(finderVisible: boolean): boolean {
    return this.send({ type: "social-set-settings", finderVisible });
  }

  sendTypingHint(to: string): boolean {
    return this.send({ type: "chat-typing", to });
  }

  setHouseAccess(
    kind: "guest" | "subowner",
    targetName: string,
    grant: boolean,
  ): boolean {
    return this.send({ type: "house-set-access", kind, targetName, grant });
  }

  setHouseList(
    kind: HouseListKind,
    body: string,
    door?: { x: number; y: number; z: number },
  ): boolean {
    return this.send({
      type: "house-set-list",
      kind,
      body,
      ...(door ? { door } : {}),
    });
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

  openStore(): boolean {
    return this.send({ type: "store-open" });
  }

  openStoreCategory(categoryId: string, page: number): boolean {
    return this.send({ type: "store-category", categoryId, page });
  }

  getStoreDescription(productId: string): boolean {
    return this.send({ type: "store-description", productId });
  }

  /** `newName` accompanies a name-change offer and nothing else. */
  purchaseStoreOffer(offerId: string, newName?: string): boolean {
    return this.send({
      type: "store-purchase",
      offerId,
      ...(newName === undefined ? {} : { newName }),
    });
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

  /** Toggles one kill-tracker entry; the server re-sends the full list. */
  setTracker(
    scope: TrackerSetMessage["scope"],
    raceId: number,
    enabled: boolean,
  ): boolean {
    return this.send({ type: "tracker-set", scope, raceId, enabled });
  }

  requestBossSlots(): boolean {
    return this.send({ type: "boss-slots-get" });
  }

  /** Assigns (raceId) or clears (null) one boss slot; server re-validates. */
  setBossSlot(slot: number, raceId: number | null): boolean {
    return this.send({ type: "boss-slot-set", slot, raceId });
  }

  requestForge(): boolean {
    return this.send({ type: "forge-get" });
  }

  /** Item ids only; the server rolls outcomes and charges all costs. */
  forgeFusion(intent: Omit<ForgeFusionMessage, "type">): boolean {
    return this.send({ type: "forge-fusion", ...intent });
  }

  forgeTransfer(intent: Omit<ForgeTransferMessage, "type">): boolean {
    return this.send({ type: "forge-transfer", ...intent });
  }

  forgeConversion(
    conversion: ForgeConversionMessage["conversion"],
  ): boolean {
    return this.send({ type: "forge-conversion", conversion });
  }

  requestForgeHistory(page: number): boolean {
    return this.send({ type: "forge-history-get", page });
  }

  requestProficiencies(): boolean {
    return this.send({ type: "proficiency-get" });
  }

  /** Full replacement of one weapon's perk picks; the server re-validates. */
  selectProficiencyPerks(
    proficiencyId: number,
    selections: ReadonlyArray<ProficiencySelection>,
  ): boolean {
    return this.send({
      type: "proficiency-select",
      proficiencyId,
      selections: [...selections],
    });
  }

  /** Requests one authorized own-character cyclopedia view. */
  requestCyclopediaCharacter(view: CyclopediaView, page?: number): boolean {
    return this.send({
      type: "cyclopedia-character-get",
      view,
      ...(page !== undefined ? { page } : {}),
    });
  }

  /** `itemId: null` opens the shrine's "Pick Item" state. */
  requestImbuementWindow(
    itemId: string | null,
    mode: "item" | "scroll" = "item",
  ): boolean {
    return this.send({ type: "imbuement-window-get", itemId, mode });
  }

  applyImbuement(
    itemId: string,
    slot: number,
    imbuementId: number,
  ): boolean {
    return this.send({ type: "imbuement-apply", itemId, slot, imbuementId });
  }

  clearImbuement(itemId: string, slot: number): boolean {
    return this.send({ type: "imbuement-clear", itemId, slot });
  }

  forgeImbuementScroll(imbuementId: number): boolean {
    return this.send({ type: "imbuement-scroll-create", imbuementId });
  }

  applyImbuementScroll(scrollItemId: string, itemId: string): boolean {
    return this.send({ type: "imbuement-scroll-apply", scrollItemId, itemId });
  }

  requestWheel(): boolean {
    return this.send({ type: "wheel-get" });
  }

  getOutfits(): boolean {
    return this.send({ type: "outfit-get" });
  }

  /** Every id is a request; the server re-validates entitlements. */
  selectOutfit(selection: Omit<OutfitSelectMessage, "type">): boolean {
    return this.send({ type: "outfit-select", ...selection });
  }

  /** Podium edits are intents; the server re-validates every entitlement. */
  setPodium(selection: Omit<PodiumSetMessage, "type">): boolean {
    return this.send({ type: "podium-set", ...selection });
  }

  /** Collects one reward item or a whole bag; the server re-checks reach. */
  collectReward(bagId: string, itemId?: string): boolean {
    return this.send({
      type: "reward-collect",
      bagId,
      ...(itemId === undefined ? {} : { itemId }),
    });
  }

  /** Claims today's daily reward; picks are re-validated server-side. */
  claimDailyReward(picks: ReadonlyArray<DailyRewardPick>): boolean {
    return this.send({ type: "daily-claim", picks: [...picks] });
  }

  /** Asks for this character's own last daily-reward claims. */
  requestDailyHistory(): boolean {
    return this.send({ type: "daily-history-get" });
  }

  /** Re-reads the open reward wall once its countdown crosses the day end. */
  requestDailyState(): boolean {
    return this.send({ type: "daily-state-get" });
  }

  requestQuestLog(): boolean {
    return this.send({ type: "quest-log-get" });
  }

  requestQuestLine(questId: number): boolean {
    return this.send({ type: "quest-line-get", questId });
  }

  saveWheel(requestId: string, slices: ReadonlyArray<number>): boolean {
    return this.send({ type: "wheel-save", requestId, slices: [...slices] });
  }

  requestGems(): boolean {
    return this.send({ type: "wheel-gems-get" });
  }

  /** Prey mutations only send intents; the server re-validates everything. */
  preyAction(
    action: PreyActionMessage["action"],
    slot: number,
    extras?: { index?: number; raceId?: number; option?: PreyOption },
  ): boolean {
    return this.send({
      type: "prey-action",
      slot,
      action,
      ...(extras?.index !== undefined ? { index: extras.index } : {}),
      ...(extras?.raceId !== undefined ? { raceId: extras.raceId } : {}),
      ...(extras?.option !== undefined ? { option: extras.option } : {}),
    });
  }

  huntingTaskAction(
    action: TaskHuntingActionMessage["action"],
    slot: number,
    extras?: { raceId?: number; upgrade?: boolean },
  ): boolean {
    return this.send({
      type: "hunting-task-action",
      slot,
      action,
      ...(extras?.raceId !== undefined ? { raceId: extras.raceId } : {}),
      ...(extras?.upgrade !== undefined ? { upgrade: extras.upgrade } : {}),
    });
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

  /** Looks up another character's public profile by display name. */
  getCharacterProfile(name: string): boolean {
    return this.send({ type: "character-profile-get", name });
  }

  /** Displays one of the own granted titles, or none with null. */
  selectTitle(titleId: string | null): boolean {
    return this.send({ type: "profile-select-title", titleId });
  }

  /** Only category and text; the server stamps reporter and position. */
  reportBug(
    category: BugReportMessage["category"],
    message: string,
  ): boolean {
    return this.send({ type: "bug-report", category, message });
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

  updateActionBot(settings: ActionBotSettings): boolean {
    return this.send({ type: "update-action-bot", settings });
  }

  updateLootFilter(filter: LootFilter): boolean {
    return this.send({ type: "update-loot-filter", filter });
  }

  requestLootFilterItems(): boolean {
    return this.send({ type: "loot-filter-items-get" });
  }

  updateHuntingBotRoute(route: HuntingBotRoute): boolean {
    return this.send({ type: "update-hunting-bot-route", route });
  }

  setHuntingBotEnabled(enabled: boolean): boolean {
    return this.send({ type: "set-hunting-bot-enabled", enabled });
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
    const messages = parseServerMessages(json);
    if (!messages) return;
    for (const message of messages) this.handleMessage(message);
  }

  private handleMessage(message: ServerMessage): void {
    if (message.type === "auth-ok") {
      this.authenticated = true;
      this.handlers.onLanguage(message.language);
      if (this.viewRange) {
        this.send({ type: "set-viewport", range: this.viewRange });
      }
      this.send({ type: "list-characters" });
      return;
    }
    if (message.type === "language-updated") {
      this.handlers.onLanguage(message.language);
      return;
    }
    if (message.type === "welcome") {
      const playerId = message.playerId;
      this.ownPlayerId = playerId;
      const own = message.creatures.find(
        (creature) => creature.id === playerId,
      );
      this.positionRevision = own?.positionRevision ?? 0;
    }
    if (
      message.type === "creature-moved" &&
      message.creatureId === this.ownPlayerId
    ) {
      this.positionRevision = message.positionRevision;
    }
    if (
      message.type === "position-correction" &&
      message.playerId === this.ownPlayerId
    ) {
      this.positionRevision = message.positionRevision;
    }
    if (message.type === "error") {
      this.handlers.onError(message.code);
      return;
    }
    this.handlers.onMessage(message);
  }

  private send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
}
