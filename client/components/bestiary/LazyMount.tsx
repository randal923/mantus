"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface LazyMountProps {
  /** Reserves this height while the content is unmounted (px). */
  placeholderHeight: number;
  children: ReactNode;
  className?: string;
}

/**
 * Mounts children only while scrolled into view. Keeps hundreds of animated
 * bestiary sprites from running intervals simultaneously.
 */
export function LazyMount({
  placeholderHeight,
  children,
  className,
}: LazyMountProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting);
      },
      { rootMargin: "600px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      style={visible ? undefined : { minHeight: placeholderHeight }}
    >
      {visible ? children : null}
    </div>
  );
}
