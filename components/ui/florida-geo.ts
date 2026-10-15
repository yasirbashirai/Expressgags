/**
 * Simplified but geographically faithful Florida outline + market coordinates (lon/lat),
 * projected to SVG space. Shared by the home-page and service-areas maps so both stay accurate.
 * Equirectangular projection with longitude scaled by cos(27.5°); good enough for a stylized map.
 */

const COASTLINE: [number, number][] = [
  // Panhandle north border (AL/GA) → St Marys River
  [-87.63, 31.0], [-85.0, 31.0], [-84.86, 30.71], [-83.5, 30.64], [-82.2, 30.57], [-82.03, 30.79], [-81.45, 30.71],
  // Atlantic coast south
  [-81.4, 30.3], [-81.27, 29.9], [-81.05, 29.3], [-80.8, 28.8], [-80.6, 28.45], [-80.58, 28.1], [-80.38, 27.6],
  [-80.2, 27.15], [-80.04, 26.7], [-80.08, 26.1], [-80.13, 25.78], [-80.3, 25.42], [-80.45, 25.22],
  // Florida Bay / Cape Sable → Gulf coast north
  [-80.75, 25.15], [-81.1, 25.13], [-81.22, 25.5], [-81.75, 25.95], [-81.92, 26.42], [-82.15, 26.75],
  [-82.45, 27.1], [-82.7, 27.5], [-82.85, 27.88], [-82.72, 28.2], [-82.75, 28.8], [-83.05, 29.15],
  [-83.5, 29.7], [-84.0, 30.08], [-84.4, 29.95], [-84.9, 29.7], [-85.35, 29.68], [-85.65, 30.15],
  [-86.2, 30.38], [-86.8, 30.4], [-87.25, 30.32], [-87.55, 30.27],
];

/** Florida Keys island chain (Key Largo → Key West) */
export const KEYS_CHAIN: [number, number][] = [[-80.45, 25.09], [-80.63, 24.92], [-80.9, 24.78], [-81.09, 24.71], [-81.4, 24.66], [-81.78, 24.56]];

export const MARKET_COORDS: Record<string, [number, number]> = {
  miami: [-80.19, 25.77],
  "fort-lauderdale-broward": [-80.14, 26.12],
  "west-palm-beach": [-80.05, 26.71],
  "cape-canaveral-port-canaveral": [-80.6, 28.4],
  orlando: [-81.38, 28.54],
  tampa: [-82.46, 27.95],
  "fort-myers": [-81.87, 26.64],
  "florida-keys-key-west": [-81.78, 24.56],
};

// Frame: crop most of the western panhandle so the peninsula fills the map.
const LON_MIN = -86.2;
const LAT_MAX = 31.15;
const SCALE = 92; // px per degree latitude
const KX = Math.cos((27.5 * Math.PI) / 180);

export function project([lon, lat]: [number, number]): { x: number; y: number } {
  return { x: Math.round((lon - LON_MIN) * KX * SCALE * 10) / 10, y: Math.round((LAT_MAX - lat) * SCALE * 10) / 10 };
}

/** SVG path for the outline (closed). */
export const FLORIDA_PATH =
  COASTLINE.map((p, i) => {
    const { x, y } = project(p);
    return `${i === 0 ? "M" : "L"}${x} ${y}`;
  }).join(" ") + " Z";

/** Bounding box of the useful frame (peninsula + Keys), for the viewBox. */
export const FLORIDA_VIEWBOX = (() => {
  const se = project([-79.4, 24.3]);
  return { x: 0, y: 0, width: se.x, height: se.y };
})();
