import type { MetadataRoute } from "next";
import { company } from "@/content/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: company.name,
    short_name: company.shortName,
    description: company.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#002858",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
