import type { Metadata } from "next";
import { Cinzel, Geist } from "next/font/google";
import en from "../locales/en.json";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: en.metadata.title,
  description: en.metadata.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${cinzel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
