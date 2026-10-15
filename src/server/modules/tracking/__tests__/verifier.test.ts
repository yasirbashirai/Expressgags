import "../../../lib/env"; // loads DATABASE_URL so importing the module (Prisma client) works
import { describe, expect, it } from "vitest";
import { verifierMatches } from "../index";

const booking = { email: "Guest@Example.com", phone: "(305) 555-0199", delivery: { address: "1 Ocean Dr, Miami Beach, FL 33139" } };

describe("tracking verifier", () => {
  it("accepts email (case-insensitive), phone last 4, delivery ZIP", () => {
    expect(verifierMatches("guest@example.com", booking)).toBe(true);
    expect(verifierMatches("0199", booking)).toBe(true);
    expect(verifierMatches("33139", booking)).toBe(true);
  });
  it("rejects anything else", () => {
    for (const v of ["other@example.com", "0198", "33140", "", "305", "Miami"]) expect(verifierMatches(v, booking)).toBe(false);
    expect(verifierMatches("0199", { ...booking, phone: null })).toBe(false);
  });
});
