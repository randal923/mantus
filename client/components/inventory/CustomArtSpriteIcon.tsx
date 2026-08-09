"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { PORTABLE_SELLER_TYPE_ID } from "@tibia/protocol";
import type { CustomItemArt } from "../../lib/render/getCustomItemArt";
import { TILE_SIZE } from "../../lib/render/tileSize";
import { GameWindowStoreContext } from "../game-window/store/GameWindowStoreContext";

const SALE_TRIGGERED_MS = 600;
const SALE_COMPLETED_MS = 900;

interface CustomArtSpriteIconProps {
  art: CustomItemArt;
  clientId: number;
  /** Zoom multiplier; frames are native pixels, default renders at 2×. */
  scale?: number;
  className?: string;
}

/**
 * Draws one frame of a custom item's PNG strip, clipped and pixel-scaled the
 * way PixelImage does it, sized exactly like the atlas icon it replaces.
 *
 * A Portable Seller icon also watches the game-window store (when one is
 * mounted above it — stories and tests render fine without): each new saleId
 * plays the one-shot sale sequence, frame 1 then frame 2 then back to rest.
 * Inline-styled for the same reason as the atlas icon: story and test mounts
 * do not load the app stylesheet.
 */
export function CustomArtSpriteIcon({
  art,
  clientId,
  scale = 2,
  className,
}: CustomArtSpriteIconProps) {
  const store = useContext(GameWindowStoreContext);
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? (() => undefined),
    [store],
  );
  const saleId = useSyncExternalStore(
    subscribe,
    () => store?.getState().portableSellerNotice?.id ?? null,
    () => null,
  );
  const [frame, setFrame] = useState(art.restingFrame);

  useEffect(() => {
    if (saleId === null || clientId !== PORTABLE_SELLER_TYPE_ID) return;
    setFrame(1);
    const completedTimer = setTimeout(() => setFrame(2), SALE_TRIGGERED_MS);
    const restTimer = setTimeout(
      () => setFrame(art.restingFrame),
      SALE_TRIGGERED_MS + SALE_COMPLETED_MS,
    );
    return () => {
      clearTimeout(completedTimer);
      clearTimeout(restTimer);
      setFrame(art.restingFrame);
    };
  }, [saleId, clientId, art.restingFrame]);

  const box = TILE_SIZE * scale;
  const frameScale = (TILE_SIZE * scale) / art.frameSize;

  return (
    <div
      aria-hidden
      className={className}
      style={{
        width: box,
        height: box,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: art.frameSize * frameScale,
          height: art.frameSize * frameScale,
          backgroundImage: `url(/assets/${art.src})`,
          backgroundPosition: `${-frame * art.frameSize * frameScale}px 0px`,
          backgroundSize: `${art.frames * art.frameSize * frameScale}px ${
            art.frameSize * frameScale
          }px`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
