"use client";

import { useEffect, useRef, useState } from "react";

interface LandingImageProps {
  src: string;
  alt: string;
  /** Shown while the image file does not exist yet in public/; omit for decorative backgrounds. */
  placeholderLabel?: string;
  className?: string;
}

export function LandingImage({
  src,
  alt,
  placeholderLabel,
  className,
}: LandingImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [missing, setMissing] = useState(false);

  // The error event can fire before hydration attaches onError; re-check.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) {
      setMissing(true);
    }
  }, [src]);

  if (missing) {
    if (!placeholderLabel) {
      return <div aria-hidden className={className} />;
    }
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center rounded-lg border border-dashed border-ui-stone-light/25 bg-black/40 ${className ?? ""}`}
      >
        <span className="max-w-xs px-4 text-center font-display text-xs tracking-widest text-ui-muted uppercase">
          {placeholderLabel}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- swaps to a styled placeholder on error; static marketing asset
    <img
      ref={imageRef}
      src={src}
      alt={alt}
      onError={() => setMissing(true)}
      className={`rounded-lg object-cover ${className ?? ""}`}
    />
  );
}
