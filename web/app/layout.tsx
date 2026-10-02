import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { copy } from "@/lib/copy";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-inter", display: "swap" });

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
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
