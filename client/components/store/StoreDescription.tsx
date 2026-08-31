"use client";

import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { parseStoreDescription } from "../../lib/store/parseStoreDescription";

interface StoreDescriptionProps {
  description: string;
}

/**
 * Renders an offer description the way the official client does: each
 * `{character}` / `{storeinbox}` / `{speedboost}` line as OTClient's own
 * 13x13 icon plus its caption, everything else as plain text.
 */
export function StoreDescription({ description }: StoreDescriptionProps) {
  const { t } = useAppTranslation();
  const lines = parseStoreDescription(description, (key, params) =>
    t(`store.tags.${key}`, params),
  );

  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => (
        <p
          key={`${line.icon ?? "text"}-${index}`}
          className="flex gap-2 text-sm leading-6 text-ui-text/85"
        >
          {line.icon && (
            <Image
              src={`/assets/store/tags/${line.icon}.png`}
              alt=""
              width={13}
              height={13}
              // `self-start` keeps the flex row from stretching the icon:
              // Tailwind's preflight leaves images at `height: auto`, so a
              // stretched cell would change the height without the width.
              className="mt-1 shrink-0 self-start [image-rendering:pixelated]"
            />
          )}
          <span className={line.icon ? "text-ui-muted" : ""}>{line.text}</span>
        </p>
      ))}
    </div>
  );
}
