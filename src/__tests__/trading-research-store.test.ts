import { describe, expect, it } from "vitest";
import { loadResearchRun, requireFreshResearchRun, saveResearchRun } from "../trading/research-store.js";

function memoryDb() {
  const store = new Map<string, string>();
  return {
    getKV: (k: string) => store.get(k),
    setKV: (k: string, v: string) => { store.set(k, v); },
  };
}

const result = [{ symbol: "BTC-USD", rows: [], decisions: {} }];

describe("research store", () => {
  it("persists the latest gated research result", () => {
    const db = memoryDb();
    saveResearchRun(db, result, "2026-01-01T00:00:00.000Z");
    expect(loadResearchRun(db)).toMatchObject({ createdAt: "2026-01-01T00:00:00.000Z", results: [{ symbol: "BTC-USD" }] });
  });

  it("accepts a recent persisted research run", () => {
    const db = memoryDb();
    saveResearchRun(db, result, "2026-01-08T00:00:00.000Z");
    expect(requireFreshResearchRun(db, Date.parse("2026-01-08T01:00:00.000Z"), 2 * 60 * 60 * 1000))
      .toMatchObject({ createdAt: "2026-01-08T00:00:00.000Z" });
  });

  it("rejects missing, stale and future research", () => {
    const now = Date.parse("2026-01-08T00:00:00.000Z");
    expect(() => requireFreshResearchRun(memoryDb(), now)).toThrow(/requires persisted/);

    const stale = memoryDb();
    saveResearchRun(stale, result, "2025-12-01T00:00:00.000Z");
    expect(() => requireFreshResearchRun(stale, now, 60 * 60 * 1000)).toThrow(/stale/);

    const future = memoryDb();
    saveResearchRun(future, result, "2026-01-09T00:00:00.000Z");
    expect(() => requireFreshResearchRun(future, now)).toThrow(/future/);
  });

  it("rejects invalid freshness configuration", () => {
    const db = memoryDb();
    saveResearchRun(db, result, "2026-01-08T00:00:00.000Z");
    expect(() => requireFreshResearchRun(db, Number.NaN)).toThrow(/configuration/);
    expect(() => requireFreshResearchRun(db, Date.parse("2026-01-08T00:00:00.000Z"), 999)).toThrow(/configuration/);
  });
});
