import type { NextConfig } from "next";
import { legacyRedirects } from "./src/content/site";

/**
 * NEXT_DIST_DIR lets parallel builds/tests use separate output folders
 * (never run two builds, or a build and `next dev`, on the same .next folder).
 */
/** CMS media is served by the API (/v1/content/media/:id); allow next/image to optimize it. */
const apiOrigins = [process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000", process.env.CMS_API_URL].filter(Boolean) as string[];
const mediaPatterns = apiOrigins.map((o) => {
  const u = new URL(o);
  return { protocol: u.protocol.replace(":", "") as "http" | "https", hostname: u.hostname, port: u.port, pathname: "/v1/content/media/**" };
});

/**
 * Content-Security-Policy (docs/SECURITY.md). Static pages can't carry per-request nonces, so inline
 * scripts are allowed ('unsafe-inline' is required by the Next.js app-router bootstrap) but every
 * script/connect/img host is allow-listed. Analytics/ads hosts are only contacted after consent
 * (components/marketing/consent-and-tags.tsx). Dev needs 'unsafe-eval' for React Refresh.
 */
const isProdBuild = process.env.NODE_ENV === "production";
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").origin;
  } catch {
    return "http://localhost:4000";
  }
})();
const tagHosts = {
  script: ["https://www.googletagmanager.com", "https://connect.facebook.net", "https://www.googleadservices.com", "https://googleads.g.doubleclick.net"],
  connect: ["https://www.google-analytics.com", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com", "https://stats.g.doubleclick.net", "https://www.google.com", "https://googleads.g.doubleclick.net", "https://www.facebook.com", "https://connect.facebook.net"],
  img: ["https://www.google-analytics.com", "https://*.google-analytics.com", "https://www.googletagmanager.com", "https://googleads.g.doubleclick.net", "https://www.google.com", "https://www.facebook.com"],
};
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProdBuild ? "" : " 'unsafe-eval'"} ${tagHosts.script.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin} ${tagHosts.img.join(" ")}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${tagHosts.connect.join(" ")}${isProdBuild ? "" : " ws: http://localhost:*"}`,
  `media-src 'self' blob: ${apiOrigin}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // Facebook Page plugin + Instagram post embeds (loaded only after the visitor clicks "Show posts")
  "frame-src 'self' https://www.facebook.com https://www.instagram.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isProdBuild && apiOrigin.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // One root layout per area ((site) en, (es) es-US, admin, driver) → the unmatched-URL 404 is app/global-not-found.tsx
  experimental: { globalNotFound: true },
  images: { formats: ["image/avif", "image/webp"], remotePatterns: mediaPatterns },
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
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(isProdBuild ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
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
