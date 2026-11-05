import type { Metadata, Viewport } from "next";
import { Anybody, Instrument_Sans } from "next/font/google";
import { siteUrl } from "@/lib/config";
import "./globals.css";

const anybody = Anybody({ subsets: ["latin"], variable: "--font-anybody", axes: ["wdth"], display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Palms in Paradise", template: "%s · Palms in Paradise" },
  description: "Caps in Aruba. Browse what is in stock, order online, pick up or get it delivered.",
};

export const viewport: Viewport = { themeColor: "#0a4f5c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anybody.variable} ${instrument.variable}`}>
      <body>{children}</body>
    </html>
  );
}
