import type { MetadataRoute } from "next";
import { copy } from "@/lib/copy";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: copy.brand,
    short_name: copy.brand,
    description: copy.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#9fe870",
    icons: [
      { src: "/mark-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/mark-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/mark-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
