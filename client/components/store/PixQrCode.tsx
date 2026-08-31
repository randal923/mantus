"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface PixQrCodeProps {
  value: string;
  size?: number;
}

export function PixQrCode({ value, size = 220 }: PixQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {});
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      role="img"
      aria-label="Pix QR code"
      className="rounded-sm bg-white"
    />
  );
}
