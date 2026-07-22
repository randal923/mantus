import { getRuneCombatTarget } from "../../lib/combat/getRuneCombatTarget";
import { MailboxModal } from "../depot/MailboxModal";
import { InventoryPanel } from "../inventory/InventoryPanel";
import { LootPanel } from "../inventory/LootPanel";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameInventoryOverlays() {
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const mailboxSession = useGameWindowStore((state) => state.mailboxSession);
  const setMailboxSession = useGameWindowStore(
    (state) => state.setMailboxSession,
  );
  const lootSession = useGameWindowStore((state) => state.lootSession);
  const setLootSession = useGameWindowStore((state) => state.setLootSession);
  const inventory = useGameWindowStore(
    (state) => state.sessions?.inventory ?? null,
  );
  const inventoryOpen = useGameWindowStore((state) => state.inventoryOpen);
  const setInventoryOpen = useGameWindowStore(
    (state) => state.setInventoryOpen,
  );
  const characterStatsOpen = useGameWindowStore(
    (state) => state.characterStatsOpen,
  );
  const setCharacterStatsOpen = useGameWindowStore(
    (state) => state.setCharacterStatsOpen,
  );
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const spells = useGameWindowStore((state) => state.spells);
  const fightState = useGameWindowStore((state) => state.fightState);
  const visibleCreatures = useGameWindowStore(
    (state) => state.visibleCreatures,
  );
  const dispatchItemOp = useGameWindowStore(
    (state) => state.sessionActions?.dispatchItemOpChecked ?? null,
  );
  const setRuneTargeting = useGameWindowStore(
    (state) => state.setRuneTargeting,
  );
  const setPotionTargeting = useGameWindowStore(
    (state) => state.setPotionTargeting,
  );
  const setUseWithTargeting = useGameWindowStore(
    (state) => state.setUseWithTargeting,
  );

  if (!ownCharacter || !dispatchItemOp) return null;

  return (
    <>
      {mailboxSession && inventory && (
        <MailboxModal
          key={mailboxSession.sessionId}
          inventoryItems={inventory.items}
          pending={mailboxSession.pending}
          error={mailboxSession.error}
          sentRecipient={mailboxSession.sentRecipient}
          onSend={(item, recipientName) => {
            const sent =
              runtime.clientRef.current?.sendMail(
                mailboxSession.sessionId,
                item,
                recipientName,
              ) ?? false;
            setMailboxSession((current) =>
              current?.sessionId === mailboxSession.sessionId
                ? {
                    ...current,
                    pending: sent,
                    error: sent ? null : "failed",
                    sentRecipient: null,
                  }
                : current,
            );
          }}
          onClose={() => {
            runtime.clientRef.current?.closeMailbox(mailboxSession.sessionId);
            setMailboxSession(null);
          }}
        />
      )}
      {lootSession && (
        <div
          className={`absolute top-24 z-30 ${
            inventoryOpen ? "right-[26rem]" : "right-4"
          }`}
        >
          <LootPanel
            state={lootSession.state}
            onLootItem={(item) =>
              runtime.clientRef.current?.lootItem(
                item,
                lootSession.state.container.id,
              )
            }
            onDragStart={(source) => {
              runtime.itemDragRef.current = source;
            }}
            onDragEnd={() => {
              runtime.itemDragRef.current = null;
            }}
            onClose={(containerId) => {
              runtime.clientRef.current?.closeWorldContainer(containerId);
              setLootSession((current) =>
                current?.state.container.id === containerId ? null : current,
              );
            }}
          />
        </div>
      )}
      {inventoryOpen && inventory && (
        <div
          className={`absolute top-24 right-4 bottom-4 z-30 w-[calc(100vw-2rem)] transition-[max-width] duration-300 ease-in-out motion-reduce:transition-none ${
            characterStatsOpen ? "max-w-3xl" : "max-w-96"
          }`}
        >
          <InventoryPanel
            characterName={ownCharacter.name}
            character={ownCharacter}
            characterStatsOpen={characterStatsOpen}
            {...inventory}
            onClose={() => {
              setInventoryOpen(false);
              setCharacterStatsOpen(false);
            }}
            onToggleCharacterStats={() =>
              setCharacterStatsOpen((open) => !open)
            }
            onEquip={(item) => {
              if (!item.equipmentSlot) return;
              dispatchItemOp({
                kind: "equip",
                itemId: item.id,
                slot: item.equipmentSlot,
              });
            }}
            onUnequip={(item, slot) => {
              if (slot === "backpack") return;
              dispatchItemOp({
                kind: "unequip",
                itemId: item.id,
                slot,
              });
            }}
            onUseRune={(item) => {
              const rune = spells.find(
                (spell) =>
                  spell.origin === "rune" &&
                  spell.runeItemTypeId === item.typeId,
              );
              const target = getRuneCombatTarget(
                rune,
                fightState?.attackTargetId ?? null,
                visibleCreatures,
                ownCharacter.position,
              );
              if (rune?.targetKind === "position") {
                runtime.pendingRuneRef.current = item;
                setRuneTargeting(true);
                setInventoryOpen(false);
                setCharacterStatsOpen(false);
                return;
              }
              runtime.clientRef.current?.useRune(item, target);
            }}
            onUsePotion={(item) => {
              runtime.pendingRuneRef.current = null;
              setRuneTargeting(false);
              runtime.pendingUseWithRef.current = null;
              setUseWithTargeting(false);
              runtime.pendingPotionRef.current = item;
              setPotionTargeting(true);
              setInventoryOpen(false);
              setCharacterStatsOpen(false);
            }}
            onUseItemWith={(item) => {
              runtime.pendingRuneRef.current = null;
              setRuneTargeting(false);
              runtime.pendingPotionRef.current = null;
              setPotionTargeting(false);
              runtime.pendingUseWithRef.current = item;
              setUseWithTargeting(true);
              setInventoryOpen(false);
              setCharacterStatsOpen(false);
            }}
            onOpenContainer={(item) =>
              runtime.clientRef.current?.openContainer(item)
            }
            onCloseContainer={(containerId) =>
              runtime.clientRef.current?.closeContainer(containerId)
            }
            onUseItem={(item) => runtime.clientRef.current?.useItem(item)}
            onDragStart={(source) => {
              runtime.itemDragRef.current = source;
            }}
            onDragEnd={() => {
              runtime.itemDragRef.current = null;
            }}
            onDropInContainer={(destination, slot, placement) => {
              const source = runtime.itemDragRef.current;
              if (!source) return;
              if (
                source.kind === "owned" &&
                source.location.kind === "container" &&
                source.location.containerId === destination.id &&
                source.location.slot === slot
              ) {
                runtime.itemDragRef.current = null;
                return;
              }
              if (source.kind === "world") {
                const queued = dispatchItemOp({
                  kind: "pickup",
                  itemId: source.item.instanceId,
                  revision: source.item.revision,
                  position: source.position,
                  ...(source.item.weight !== undefined
                    ? { weight: source.item.weight * source.item.count }
                    : {}),
                  destination: {
                    containerId: destination.id,
                    slot,
                    ...(placement ? { placement } : {}),
                  },
                });
                if (queued) {
                  runtime.rendererRef.current?.previewMapItemRemoval(
                    source.position,
                    source.item.instanceId,
                  );
                }
              } else if (source.kind === "loot") {
                runtime.clientRef.current?.lootItem(
                  source.item,
                  source.containerId,
                  {
                    containerId: destination.id,
                    containerRevision: destination.revision,
                    slot,
                    ...(placement ? { placement } : {}),
                  },
                );
              } else if (source.location.kind === "equipment") {
                if (source.location.slot === "backpack") {
                  runtime.itemDragRef.current = null;
                  return;
                }
                dispatchItemOp({
                  kind: "unequip",
                  itemId: source.item.id,
                  slot: source.location.slot,
                  destination: {
                    containerId: destination.id,
                    slot,
                    ...(placement ? { placement } : {}),
                  },
                });
              } else {
                dispatchItemOp({
                  kind: "move",
                  itemId: source.item.id,
                  destinationContainerId: destination.id,
                  destinationSlot: slot,
                  ...(placement
                    ? { destinationPlacement: placement }
                    : {}),
                });
              }
              runtime.itemDragRef.current = null;
            }}
            onDropInEquipment={(slot) => {
              const source = runtime.itemDragRef.current;
              runtime.itemDragRef.current = null;
              if (source?.kind === "world") {
                const queued = dispatchItemOp({
                  kind: "pickup",
                  itemId: source.item.instanceId,
                  revision: source.item.revision,
                  position: source.position,
                  ...(source.item.weight !== undefined
                    ? { weight: source.item.weight * source.item.count }
                    : {}),
                  equipSlot: slot,
                });
                if (queued) {
                  runtime.rendererRef.current?.previewMapItemRemoval(
                    source.position,
                    source.item.instanceId,
                  );
                }
                return;
              }
              if (source?.kind !== "owned") return;
              if (
                source.location.kind === "equipment" &&
                source.location.slot === slot
              ) {
                return;
              }
              dispatchItemOp({
                kind: "equip",
                itemId: source.item.id,
                slot,
              });
            }}
          />
        </div>
      )}
    </>
  );
}
