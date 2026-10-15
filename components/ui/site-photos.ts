/**
 * Brand photography (AI-generated illustrative scenes supplied by Express Bags' developer, with the real logo
 * applied to the trucks). Source files: ../express-bags-client/images → processed by scripts/art/brand-photos.mjs.
 * These are illustrative brand images, not photos of specific jobs; swap in real operation photos when available.
 */
export type SitePhoto = { src: string; alt: string; width: number; height: number; position?: string };

export const sitePhotos = {
  sunrise: {
    src: "/images/site/hero-sunrise-waterfront.jpg",
    alt: "Express Bags box truck driving along the Miami waterfront at sunrise, with cruise ships and the skyline behind",
    width: 1916, height: 821, position: "70% 50%",
  },
  valet: {
    src: "/images/site/hero-resort-valet-night.jpg",
    alt: "Express Bags van at a luxury resort entrance at night, luggage with orange tags loaded with care",
    width: 1916, height: 821, position: "75% 50%",
  },
  cruise: {
    src: "/images/site/cruise-port-terminal.jpg",
    alt: "Express Bags trucks lined up beside a cruise ship at a Florida terminal with staged luggage carts",
    width: 1086, height: 1448, position: "50% 55%",
  },
  qrScan: {
    src: "/images/site/qr-scan-chain-of-custody.jpg",
    alt: "Gloved hand scanning an orange Express Bags QR luggage tag inside a truck, scan confirmed on screen",
    width: 1448, height: 1086, position: "50% 50%",
  },
  keysBridge: {
    src: "/images/site/keys-bridge-sunset.jpg",
    alt: "Express Bags box truck crossing a Florida Keys bridge at sunset over turquoise water",
    width: 1448, height: 1086, position: "50% 60%",
  },
} satisfies Record<string, SitePhoto>;
