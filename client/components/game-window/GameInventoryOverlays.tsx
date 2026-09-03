import type { InventoryItem, ItemContainerDestination } from "@tibia/protocol";
import { getRuneCombatTarget } from "../../lib/combat/getRuneCombatTarget";
import { quiverDropDestination } from "../../lib/inventory/quiverDropDestination";
import { MailboxModal } from "../depot/MailboxModal";
import { CarriedContainerPanel } from "../inventory/CarriedContainerPanel";
import type { ItemDragSource } from "../inventory/ItemDragSource";
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
  const lootSessions = useGameWindowStore((state) => state.lootSessions);
  const setLootSessions = useGameWindowStore((state) => state.setLootSessions);
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
  // Carried containers opened from a gear slot (the quiver) or an action-bar
  // button float beside the inventory like loot windows.
  const floatingContainerIds = useGameWindowStore(
    (state) => state.floatingContainerIds,
  );
  const openFloatingContainer = useGameWindowStore(
    (state) => state.openFloatingContainer,
  );
  const forgetFloatingContainer = useGameWindowStore(
    (state) => state.closeFloatingContainer,
  );

  if (!ownCharacter || !dispatchItemOp) return null;

  const floatingContainers = floatingContainerIds.flatMap((containerId) => {
    const state = inventory?.containers?.find(
      (container) => container.container.id === containerId,
    );
    return state ? [state] : [];
  });
  const dropInContainer = (
    source: ItemDragSource,
    destination: InventoryItem,
    slot: number,
    placement?: ItemContainerDestination["placement"],
  ) => {
    if (
      source.kind === "owned" &&
      source.location.kind === "container" &&
      source.location.containerId === destination.id &&
      source.location.slot === slot
    ) {
      return;
    }
    // Read lazily: the handler runs from events, never during render.
    const { rendererRef, clientRef } = store.getState().runtime;
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
        rendererRef.current?.previewMapItemRemoval(
          source.position,
          source.item.instanceId,
        );
      }
      return;
    }
    if (source.kind === "loot") {
      clientRef.current?.lootItem(source.item, source.containerId, {
        containerId: destination.id,
        containerRevision: destination.revision,
        slot,
        ...(placement ? { placement } : {}),
      });
      return;
    }
    if (source.location.kind === "equipment") {
      if (source.location.slot === "backpack") return;
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
      return;
    }
    dispatchItemOp({
      kind: "move",
      itemId: source.item.id,
      destinationContainerId: destination.id,
      destinationSlot: slot,
      ...(placement ? { destinationPlacement: placement } : {}),
    });
  };
  const closeFloatingContainer = (containerId: string) => {
    runtime.clientRef.current?.closeContainer(containerId);
    forgetFloatingContainer(containerId);
  };

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
      {(lootSessions.length > 0 || floatingContainers.length > 0) && (
        <div
          className={`absolute top-24 z-30 flex flex-col gap-2 ${
            inventoryOpen ? "right-[26rem]" : "right-4"
          }`}
        >
          {floatingContainers.map((state) => (
            <CarriedContainerPanel
              key={state.container.id}
              state={state}
              onActivate={(item) => {
                if (item.equipmentSlot && item.equipmentSlot !== "backpack") {
                  dispatchItemOp({
                    kind: "equip",
                    itemId: item.id,
                    slot: item.equipmentSlot,
                  });
                  return;
                }
                runtime.clientRef.current?.useItem(item);
              }}
              onDragStart={(source) => {
                runtime.itemDragRef.current = source;
              }}
              onDragEnd={() => {
                runtime.itemDragRef.current = null;
              }}
              onDrop={(destination, slot) => {
                const source = runtime.itemDragRef.current;
                runtime.itemDragRef.current = null;
                if (source) dropInContainer(source, destination, slot);
              }}
              onClose={closeFloatingContainer}
            />
          ))}
          {lootSessions.map((lootSession) => (
            <LootPanel
              key={lootSession.state.container.id}
              state={lootSession.state}
              onLootItem={(item) =>
                runtime.clientRef.current?.lootItem(
                  item,
                  lootSession.state.container.id,
                )
              }
              onOpenContainer={(item) =>
                runtime.clientRef.current?.openWorldContainer(item)
              }
              onQuickLoot={(containerId) =>
                runtime.clientRef.current?.quickLoot(containerId)
              }
              onDragStart={(source) => {
                runtime.itemDragRef.current = source;
              }}
              onDragEnd={() => {
                runtime.itemDragRef.current = null;
              }}
              onClose={(containerId) => {
                runtime.clientRef.current?.closeWorldContainer(containerId);
                setLootSessions((current) =>
                  current.filter(
                    (session) => session.state.container.id !== containerId,
                  ),
                );
              }}
            />
          ))}
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
            onStack={(containerId) =>
              runtime.clientRef.current?.stackContainer(containerId)
            }
            onSort={(containerId) =>
              runtime.clientRef.current?.sortContainer(containerId)
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
              const state = store.getState();
              const target = getRuneCombatTarget(
                rune,
                state.fightState?.attackTargetId ?? null,
                state.visibleCreatures,
                state.ownCharacter?.position ?? ownCharacter.position,
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
              runtime.itemDragRef.current = null;
              if (source) dropInContainer(source, destination, slot, placement);
            }}
            onOpenEquippedContainer={(item) => {
              runtime.clientRef.current?.openContainer(item);
              openFloatingContainer(item.id);
            }}
            onDropInEquipment={(slot) => {
              const source = runtime.itemDragRef.current;
              runtime.itemDragRef.current = null;
              if (!source) return;
              // Ammunition dropped on the equipped quiver goes inside it
              // (Canary movingAmmoToQuiver); map items are routed the same
              // way and the server refuses anything but ammunition.
              const quiver = inventory.equipment[slot];
              if (
                quiver?.quiver &&
                (source.kind === "world" ||
                  source.item.equipmentSlot === "ammo")
              ) {
                const target = quiverDropDestination(
                  inventory,
                  quiver,
                  source.kind === "world"
                    ? { typeId: source.item.itemId, maxCount: 100 }
                    : source.item,
                );
                if (!target) return;
                const placement = target.placement
                  ? { placement: target.placement }
                  : {};
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
                      containerId: quiver.id,
                      slot: target.slot,
                      ...placement,
                    },
                  });
                  if (queued) {
                    runtime.rendererRef.current?.previewMapItemRemoval(
                      source.position,
                      source.item.instanceId,
                    );
                  }
                  return;
                }
                if (source.kind === "loot") {
                  runtime.clientRef.current?.lootItem(
                    source.item,
                    source.containerId,
                    {
                      containerId: quiver.id,
                      containerRevision: quiver.revision,
                      slot: target.slot,
                      ...placement,
                    },
                  );
                  return;
                }
                if (source.location.kind === "equipment") {
                  if (source.location.slot === slot) return;
                  dispatchItemOp({
                    kind: "unequip",
                    itemId: source.item.id,
                    slot: source.location.slot,
                    destination: {
                      containerId: quiver.id,
                      slot: target.slot,
                      ...placement,
                    },
                  });
                  return;
                }
                dispatchItemOp({
                  kind: "move",
                  itemId: source.item.id,
                  destinationContainerId: quiver.id,
                  destinationSlot: target.slot,
                  ...(target.placement
                    ? { destinationPlacement: target.placement }
                    : {}),
                });
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
