import { randomInt } from "node:crypto";

// No 0/O/1/I to keep references easy to read over the phone
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function code(len: number) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

function yymmdd(d = new Date()) {
  return d.toISOString().slice(2, 10).replace(/-/g, "");
}

/** Quote reference, e.g. EB-Q-261015-7K3P */
export const quoteReference = (d = new Date()) => `EB-Q-${yymmdd(d)}-${code(4)}`;
/** Order reference, e.g. EB-261015-7K3P; pieces are <ref>-01, -02… */
export const orderReference = (d = new Date()) => `EB-${yymmdd(d)}-${code(4)}`;
export const pieceId = (orderRef: string, n: number) => `${orderRef}-${String(n).padStart(2, "0")}`;
