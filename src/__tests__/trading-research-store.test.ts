import { describe, expect, it } from "vitest";
import { createPaperResearchPolicy } from "../trading/research-policy.js";
import { loadResearchRun, requireFreshResearchRun, saveResearchRun } from "../trading/research-store.js";

function memoryDb() {
  const store = new Map<string, string>();
  return {
    getKV: (k: string) => store.get(k),
    setKV: (k: string, v: string) => { store.set(k, v); },
  };
}

const policy = createPaperResearchPolicy();
const result = policy.symbols.map((symbol) => ({ symbol, rows: [], decisions: {} }));

describe("research store", () => {
  it("persists the latest gated research result with its policy", () => {
    const db = memoryDb();
    saveResearchRun(db, result, policy, "2026-01-01T00:00:00.000Z");
    expect(loadResearchRun(db)).toMatchObject({
      createdAt: "2026-01-01T00:00:00.000Z",
      policy: {
        schemaVersion: 1,
        strategy: "momentum-20-2",
        timeframe: "1h",
        gate: { minWindows: 4, minProfitableWindowRatio: 0.5, maxDrawdownPct: 10, minAverageTestReturnPct: 0 },
      },
      results: policy.symbols.map((symbol) => ({ symbol })),
    });
  });

  it("accepts a recent persisted research run", () => {
    const db = memoryDb();
    saveResearchRun(db, result, policy, "2026-01-08T00:00:00.000Z");
    expect(requireFreshResearchRun(db, Date.parse("2026-01-08T01:00:00.000Z"), 2 * 60 * 60 * 1000))
      .toMatchObject({ createdAt: "2026-01-08T00:00:00.000Z", policy: { feeRate: 0.001, slippageRate: 0.0005 } });
  });

  it("rejects missing, stale and future research", () => {
    const now = Date.parse("2026-01-08T00:00:00.000Z");
    expect(() => requireFreshResearchRun(memoryDb(), now)).toThrow(/requires persisted/);

    const stale = memoryDb();
    saveResearchRun(stale, result, policy, "2025-12-01T00:00:00.000Z");
    expect(() => requireFreshResearchRun(stale, now, 60 * 60 * 1000)).toThrow(/stale/);

    const future = memoryDb();
    saveResearchRun(future, result, policy, "2026-01-09T00:00:00.000Z");
    expect(() => requireFreshResearchRun(future, now)).toThrow(/future/);
  });

  it("rejects invalid freshness configuration", () => {
    const db = memoryDb();
    saveResearchRun(db, result, policy, "2026-01-08T00:00:00.000Z");
    expect(() => requireFreshResearchRun(db, Number.NaN)).toThrow(/configuration/);
    expect(() => requireFreshResearchRun(db, Date.parse("2026-01-08T00:00:00.000Z"), 999)).toThrow(/configuration/);
  });

  it("rejects research whose stored policy markets do not match its results", () => {
    const db = memoryDb();
    expect(() => saveResearchRun(db, result.slice(0, 1), policy)).toThrow(/policy does not match/);
  });

  it("rejects missing or corrupted persisted OOS gate metadata", () => {
    const variants = [
      { ...policy, gate: undefined },
      { ...policy, gate: { ...policy.gate, minWindows: 0 } },
      { ...policy, gate: { ...policy.gate, minProfitableWindowRatio: 1.1 } },
      { ...policy, gate: { ...policy.gate, maxDrawdownPct: -1 } },
      { ...policy, gate: { ...policy.gate, minAverageTestReturnPct: Number.NaN } },
    ];

    for (const corrupted of variants) {
      const db = memoryDb();
      expect(() => saveResearchRun(db, result, corrupted as typeof policy)).toThrow(/invalid/);
    }
  });
});
