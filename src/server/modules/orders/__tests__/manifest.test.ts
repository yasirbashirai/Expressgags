import "../../../lib/env"; // loads DATABASE_URL so importing the module (Prisma client) works
import { describe, expect, it } from "vitest";
import { expandPieces, parseCsv, parseManifest } from "../service";

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, CRLF and blank lines", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,2')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["1", "2"]]);
  });
});

describe("group manifest", () => {
  it("maps flexible headers, aliases and quantities", () => {
    const { rows, errors } = parseManifest("Guest Name,Room,Bag Type,Qty,Notes\nAna Lopez,1204,suitcase,2,fragile\nBen Ito,88,golf,1,");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { category: "standard-checked", description: undefined, guestName: "Ana Lopez", room: "1204", notes: "fragile", quantity: 2 },
      { category: "special", description: undefined, guestName: "Ben Ito", room: "88", notes: undefined, quantity: 1 },
    ]);
  });
  it("defaults the category when the column is missing and reports bad rows", () => {
    expect(parseManifest("guest\nAna").rows[0].category).toBe("standard-checked");
    const bad = parseManifest("category,qty\nhovercraft,1\nlarge,0");
    expect(bad.errors).toHaveLength(2);
  });
  it("requires header + data", () => {
    expect(parseManifest("only-a-header").errors[0]).toMatch(/header row/);
  });
});

describe("piece expansion", () => {
  it("creates one row per physical piece", () => {
    expect(expandPieces([{ category: "large", quantity: 3 }, { category: "special" }])).toHaveLength(4);
  });
});
