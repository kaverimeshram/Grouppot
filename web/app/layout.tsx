import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { copy } from "@/lib/copy";
import "./globals.css";

// Manrope: rounded and friendly rather than fintech-cold, tabular figures for the pot, and latin-ext plus vietnamese
// subsets carry the dot-below letters (ẹ ọ ṣ) in Yoruba names.
const sans = Manrope({ subsets: ["latin", "latin-ext", "vietnamese"], weight: ["400", "600", "700"], variable: "--font-sans-face", display: "swap" });

export const metadata: Metadata = {
  title: copy.titles.home,
  description: copy.description,
  applicationName: copy.brand,
  icons: { icon: "/favicon.ico", apple: "/mark-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={sans.variable}>{children}</body>
    </html>
  );
}
