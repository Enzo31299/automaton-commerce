import { describe, expect, it } from "vitest";
import { InMemoryMarketDataProvider } from "../trading/market-data.js";
import { createPaperTraderRuntime } from "../trading/runtime.js";
import type { Strategy } from "../trading/strategy.js";

const strategy: Strategy = { name: "runtime-test", signal: () => "buy" };

function runtimeConfig() {
  return {
    initialEquity: 150,
    quantity: 0.25,
    riskLimits: {
      maxPositionValue: 50,
      maxRiskPerTrade: 2,
      maxDailyLoss: 5,
      maxOpenPositions: 2,
      allowedSymbols: ["BTC-USD"],
    },
  };
}

describe("paper trader runtime", () => {
  it("assembles market data, risk, paper execution, journal and memory", async () => {
    const store = new Map<string, string>();
    const db = { getKV: (k: string) => store.get(k), setKV: (k: string, v: string) => { store.set(k, v); } };
    const market = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [{ timestamp: 1, open: 100, high: 100, low: 100, close: 100 }]],
    ]));
    const runtime = createPaperTraderRuntime(db, market, strategy, { eligible: true, reasons: [] }, runtimeConfig());
    await runtime.tick({ symbol: "BTC-USD", timeframe: "1d" });
    expect(runtime.snapshot().trades).toBe(1);
    expect(store.get("trader:journal")).toContain("paper_fill");
    expect(store.get("trader:memory:summary")).toContain('\"paperFills\":1');
    expect(store.has("trader:last_tick")).toBe(true);
  });

  it("persists an already-simulated fill when a later journal write fails", async () => {
    const store = new Map<string, string>();
    let journalWrites = 0;
    const db = {
      getKV: (k: string) => store.get(k),
      setKV: (k: string, v: string) => {
        if (k === "trader:journal") {
          journalWrites += 1;
          if (journalWrites === 2) throw new Error("simulated journal failure");
        }
        store.set(k, v);
      },
    };
    const market = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [{ timestamp: 1, open: 100, high: 100, low: 100, close: 100 }]],
    ]));
    const runtime = createPaperTraderRuntime(db, market, strategy, { eligible: true, reasons: [] }, runtimeConfig());

    await expect(runtime.tick({ symbol: "BTC-USD", timeframe: "1d" })).rejects.toThrow(/journal failure/);
    expect(runtime.snapshot().trades).toBe(1);
    expect(store.has("trader:paper:portfolio")).toBe(true);

    const restarted = createPaperTraderRuntime(db, market, strategy, { eligible: true, reasons: [] }, runtimeConfig());
    expect(restarted.snapshot().trades).toBe(1);
    expect(restarted.snapshot().positions["BTC-USD"]?.quantity).toBeCloseTo(0.25, 8);
  });

  it("applies configured paper fees and slippage through the assembled runtime", async () => {
    const store = new Map<string, string>();
    const db = { getKV: (k: string) => store.get(k), setKV: (k: string, v: string) => { store.set(k, v); } };
    const market = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [{ timestamp: 1, open: 100, high: 100, low: 100, close: 100 }]],
    ]));
    const runtime = createPaperTraderRuntime(db, market, strategy, { eligible: true, reasons: [] }, {
      initialEquity: 150,
      quantity: 1,
      execution: { feeRate: 0.01, slippageRate: 0.01 },
      riskLimits: {
        maxPositionValue: 120,
        maxRiskPerTrade: 20,
        maxDailyLoss: 20,
        maxOpenPositions: 2,
        allowedSymbols: ["BTC-USD"],
      },
    });

    await runtime.tick({ symbol: "BTC-USD", timeframe: "1d" });
    const snapshot = runtime.snapshot();
    expect(snapshot.trades).toBe(1);
    expect(snapshot.cash).toBeCloseTo(47.99, 8);
    expect(snapshot.positions["BTC-USD"]?.averageEntryPrice).toBeCloseTo(102.01, 8);
  });

  it("cannot start when research eligibility is rejected", () => {
    const db = { getKV: () => undefined, setKV: () => {} };
    const market = new InMemoryMarketDataProvider(new Map());
    expect(() => createPaperTraderRuntime(db, market, strategy, { eligible: false, reasons: ["insufficient_out_of_sample_windows"] }, {
      initialEquity: 150,
      quantity: 0.25,
      riskLimits: { maxPositionValue: 50, maxRiskPerTrade: 2, maxDailyLoss: 5, maxOpenPositions: 2, allowedSymbols: ["BTC-USD"] },
    })).toThrow(/Research gate blocked/);
  });
});
