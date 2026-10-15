import type { NextConfig } from "next";
import { legacyRedirects } from "./src/content/site";

/**
 * NEXT_DIST_DIR lets parallel builds/tests use separate output folders
 * (never run two builds, or a build and `next dev`, on the same .next folder).
 */
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  async redirects() {
    // Old GoDaddy Website Builder URLs → new pages (only where the path actually changes)
    return legacyRedirects
      .filter((r) => r.source !== r.destination)
      .map((r) => ({ source: r.source, destination: r.destination, permanent: true }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Driver app needs the camera (bag-tag QR scanning, condition photos) and GPS (scan locations).
        // Listed after the global rule so it overrides Permissions-Policy for /driver only.
        source: "/driver/:path*",
        headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" }],
      },
    ];
  },
};

export default nextConfig;
