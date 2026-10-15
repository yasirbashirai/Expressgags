/**
 * Original Express Bags brand illustrations (inline SVG, no stock imagery, no people).
 * Flat, geometric, navy/orange line style that echoes the logo's orbit and dashed flight line.
 * All decorative by default (aria-hidden); pass `title` to expose one to assistive tech.
 */
import { useId, type SVGProps } from "react";

type IllProps = SVGProps<SVGSVGElement> & { title?: string };

const NAVY = "#002858";
const ORANGE = "#E06010";

function Svg({ title, children, viewBox, ...rest }: IllProps & { viewBox: string }) {
  return (
    <svg viewBox={viewBox} fill="none" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...rest}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Rolling suitcase with a QR bag tag. */
export function SuitcaseArt(p: IllProps) {
  const gid = `sc-sheen-${useId().replace(/:/g, "")}`;
  return (
    <Svg viewBox="0 0 200 220" {...p}>
      <ellipse cx="100" cy="206" rx="62" ry="7" fill={NAVY} opacity=".12" />
      <rect x="78" y="10" width="44" height="30" rx="10" stroke={NAVY} strokeWidth="7" />
      <rect x="42" y="36" width="116" height="156" rx="20" fill={NAVY} />
      <rect x="42" y="36" width="116" height="156" rx="20" fill={`url(#${gid})`} />
      {[70, 100, 130].map((x) => <rect key={x} x={x - 3} y="54" width="6" height="120" rx="3" fill="#fff" opacity=".14" />)}
      <circle cx="62" cy="198" r="9" fill={NAVY} stroke="#fff" strokeWidth="3" />
      <circle cx="138" cy="198" r="9" fill={NAVY} stroke="#fff" strokeWidth="3" />
      {/* tag */}
      <path d="M150 70 C170 66 176 84 168 96" stroke={ORANGE} strokeWidth="3" />
      <g transform="rotate(10 172 120)">
        <rect x="150" y="96" width="44" height="58" rx="7" fill="#fff" stroke={ORANGE} strokeWidth="3" />
        <circle cx="172" cy="104" r="3" fill={ORANGE} />
        <QrGlyph x={156} y={112} size={32} />
      </g>
      <defs>
        <linearGradient id={gid} x1="42" y1="36" x2="158" y2="192">
          <stop stopColor="#fff" stopOpacity=".12" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </Svg>
  );
}

/** Tiny deterministic QR-like glyph (decorative, not scannable). */
export function QrGlyph({ x = 0, y = 0, size = 40, color = NAVY }: { x?: number; y?: number; size?: number; color?: string }) {
  const n = 9;
  const c = size / n;
  // fixed pattern: finder squares + pseudo-random modules
  const on = (i: number, j: number) => {
    const finder = (a: number, b: number) => i >= a && i < a + 3 && j >= b && j < b + 3;
    if (finder(0, 0) || finder(0, 6) || finder(6, 0)) return !(i % 3 === 1 && j % 3 === 1) || (i === 1 && j === 1) || (i === 1 && j === 7) || (i === 7 && j === 1);
    return ((i * 7 + j * 13 + i * j) % 5) < 2;
  };
  const cells = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (on(i, j)) cells.push(<rect key={`${i}-${j}`} x={x + j * c} y={y + i * c} width={c + 0.2} height={c + 0.2} fill={color} />);
  return <g>{cells}</g>;
}

/** Box truck (26 ft feel) in side view. */
export function BoxTruckArt(p: IllProps) {
  return (
    <Svg viewBox="0 0 320 170" {...p}>
      <ellipse cx="160" cy="158" rx="140" ry="8" fill={NAVY} opacity=".12" />
      <rect x="18" y="22" width="196" height="108" rx="10" fill="#fff" stroke={NAVY} strokeWidth="5" />
      <path d="M40 76 h150" stroke={ORANGE} strokeWidth="4" strokeDasharray="10 8" />
      <circle cx="58" cy="54" r="10" stroke={ORANGE} strokeWidth="4" />
      <ellipse cx="58" cy="54" rx="22" ry="9" stroke={NAVY} strokeWidth="3" transform="rotate(-20 58 54)" />
      <path d="M214 52 h52 l32 34 v44 h-84z" fill={NAVY} />
      <path d="M224 60 h38 l22 24 h-60z" fill="#fff" opacity=".85" />
      <rect x="292" y="104" width="10" height="8" rx="2" fill={ORANGE} />
      {[64, 172, 262].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="134" r="18" fill={NAVY} />
          <circle cx={cx} cy="134" r="7" fill="#fff" />
        </g>
      ))}
    </Svg>
  );
}

/** Cruise ship with luggage carts at the terminal. */
export function CruiseShipArt(p: IllProps) {
  return (
    <Svg viewBox="0 0 320 180" {...p}>
      <path d="M0 150 C40 142 80 158 120 150 S200 142 240 150 S300 158 320 150 V180 H0Z" fill={NAVY} opacity=".1" />
      <path d="M30 116 h236 l-26 34 h-186z" fill={NAVY} />
      <rect x="60" y="86" width="176" height="30" rx="4" fill="#fff" stroke={NAVY} strokeWidth="4" />
      <rect x="86" y="62" width="120" height="24" rx="4" fill="#fff" stroke={NAVY} strokeWidth="4" />
      <rect x="150" y="34" width="22" height="28" rx="3" fill={ORANGE} />
      {Array.from({ length: 10 }).map((_, i) => <circle key={i} cx={74 + i * 16} cy="101" r="3.4" fill={NAVY} />)}
      {Array.from({ length: 6 }).map((_, i) => <rect key={i} x={98 + i * 17} y="70" width="9" height="8" rx="2" fill={NAVY} opacity=".7" />)}
      <path d="M40 128 h220" stroke={ORANGE} strokeWidth="3" strokeDasharray="8 7" />
    </Svg>
  );
}

/** Plane taking off over the dashed flight line. */
export function PlaneArt(p: IllProps) {
  return (
    <Svg viewBox="0 0 300 160" {...p}>
      <path d="M10 140 C80 140 140 120 200 70" stroke={ORANGE} strokeWidth="4" strokeDasharray="10 9" strokeLinecap="round" />
      <g transform="translate(196 34) rotate(-28)">
        <path d="M0 26 L86 18 Q100 17 100 26 Q100 35 86 34 L0 26Z" fill={NAVY} />
        <path d="M40 22 L18 -8 L32 -8 L62 20Z" fill={NAVY} />
        <path d="M40 30 L18 60 L32 60 L62 32Z" fill={NAVY} />
        <path d="M6 24 L-4 8 L6 8 L16 22Z" fill={ORANGE} />
        {[52, 62, 72].map((x) => <circle key={x} cx={x} cy="24" r="2.2" fill="#fff" />)}
      </g>
    </Svg>
  );
}

/** Concierge bell + luggage cart (hotel logistics). */
export function HotelArt(p: IllProps) {
  return (
    <Svg viewBox="0 0 260 200" {...p}>
      <ellipse cx="130" cy="186" rx="104" ry="7" fill={NAVY} opacity=".12" />
      <path d="M40 30 Q130 -6 220 30" stroke={NAVY} strokeWidth="6" />
      <path d="M50 30 v140 M210 30 v140" stroke={NAVY} strokeWidth="6" />
      <path d="M40 170 h180" stroke={NAVY} strokeWidth="6" />
      <rect x="66" y="96" width="52" height="70" rx="8" fill={ORANGE} />
      <rect x="124" y="72" width="64" height="94" rx="10" fill={NAVY} />
      <rect x="138" y="58" width="36" height="16" rx="6" stroke={NAVY} strokeWidth="5" />
      <rect x="80" y="84" width="24" height="14" rx="5" stroke={ORANGE} strokeWidth="5" />
      <circle cx="62" cy="182" r="7" fill={NAVY} />
      <circle cx="198" cy="182" r="7" fill={NAVY} />
    </Svg>
  );
}

/** Storage racks with tagged bags. */
export function StorageArt(p: IllProps) {
  return (
    <Svg viewBox="0 0 260 200" {...p}>
      <rect x="24" y="16" width="212" height="172" rx="12" fill="#fff" stroke={NAVY} strokeWidth="5" />
      {[70, 124].map((y) => <path key={y} d={`M24 ${y} h212`} stroke={NAVY} strokeWidth="4" />)}
      {[
        [44, 30, 34, 40, ORANGE], [88, 24, 44, 46, NAVY], [146, 34, 30, 36, NAVY], [184, 28, 34, 42, ORANGE],
        [44, 84, 44, 40, NAVY], [100, 80, 30, 44, ORANGE], [142, 86, 44, 38, NAVY],
        [50, 138, 36, 44, ORANGE], [98, 134, 44, 48, NAVY], [156, 140, 32, 42, NAVY],
      ].map(([x, y, w, h, c], i) => (
        <g key={i}>
          <rect x={x as number} y={y as number} width={w as number} height={h as number} rx="7" fill={c as string} />
          <rect x={(x as number) + 6} y={(y as number) + 8} width="10" height="13" rx="2" fill="#fff" />
        </g>
      ))}
    </Svg>
  );
}

/** Trophy + gear cases (sports, entertainment, events). */
export function EventsArt(p: IllProps) {
  return (
    <Svg viewBox="0 0 260 200" {...p}>
      <ellipse cx="130" cy="188" rx="110" ry="7" fill={NAVY} opacity=".12" />
      <rect x="22" y="104" width="96" height="76" rx="10" fill={NAVY} />
      <rect x="22" y="104" width="96" height="16" rx="6" fill="#fff" opacity=".14" />
      <rect x="128" y="124" width="110" height="56" rx="10" fill={ORANGE} />
      {[46, 94].map((x) => <rect key={x} x={x - 8} y="138" width="16" height="10" rx="3" fill="#fff" opacity=".7" />)}
      <path d="M160 20 h40 v26 a20 20 0 0 1 -40 0z" fill={ORANGE} />
      <path d="M160 26 h-12 a12 12 0 0 0 12 18 M200 26 h12 a12 12 0 0 1 -12 18" stroke={ORANGE} strokeWidth="5" />
      <rect x="174" y="64" width="12" height="22" fill={NAVY} />
      <rect x="160" y="86" width="40" height="10" rx="3" fill={NAVY} />
    </Svg>
  );
}

/** Parcel with route pin (courier & last-mile). */
export function CourierArt(p: IllProps) {
  return (
    <Svg viewBox="0 0 260 200" {...p}>
      <path d="M20 170 C80 170 90 120 140 120 S210 80 236 40" stroke={ORANGE} strokeWidth="4" strokeDasharray="9 8" strokeLinecap="round" />
      <path d="M236 14 a18 18 0 0 1 18 18 c0 16 -18 34 -18 34 s-18 -18 -18 -34 a18 18 0 0 1 18 -18z" fill={NAVY} />
      <circle cx="236" cy="32" r="7" fill="#fff" />
      <path d="M40 92 l60 -26 l60 26 v66 l-60 26 l-60 -26z" fill="#fff" stroke={NAVY} strokeWidth="5" strokeLinejoin="round" />
      <path d="M40 92 l60 26 l60 -26 M100 118 v66" stroke={NAVY} strokeWidth="5" strokeLinejoin="round" />
      <path d="M70 79 l60 26" stroke={ORANGE} strokeWidth="6" />
    </Svg>
  );
}

/** Pallet stack (commercial / truck logistics). */
export function PalletArt(p: IllProps) {
  return (
    <Svg viewBox="0 0 260 200" {...p}>
      <rect x="40" y="38" width="80" height="64" rx="6" fill={NAVY} />
      <rect x="128" y="38" width="80" height="64" rx="6" fill={ORANGE} />
      <rect x="84" y="106" width="88" height="56" rx="6" fill={NAVY} opacity=".85" />
      <path d="M30 168 h200 M30 184 h200" stroke={NAVY} strokeWidth="7" />
      {[44, 120, 196].map((x) => <rect key={x} x={x} y="168" width="18" height="16" fill={NAVY} />)}
    </Svg>
  );
}
