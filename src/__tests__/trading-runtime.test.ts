import { describe, expect, it } from "vitest";
import { InMemoryMarketDataProvider } from "../trading/market-data.js";
import { createPaperTraderRuntime } from "../trading/runtime.js";
import type { Strategy } from "../trading/strategy.js";

const strategy: Strategy = { name: "runtime-test", signal: () => "buy" };

describe("paper trader runtime", () => {
  it("assembles market data, risk, paper execution, journal and memory", async () => {
    const store = new Map<string, string>();
    const db = { getKV: (k: string) => store.get(k), setKV: (k: string, v: string) => { store.set(k, v); } };
    const market = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [{ timestamp: 1, open: 100, high: 100, low: 100, close: 100 }]],
    ]));
    const runtime = createPaperTraderRuntime(db, market, strategy, { eligible: true, reasons: [] }, {
      initialEquity: 150,
      quantity: 0.25,
      riskLimits: {
        maxPositionValue: 50,
        maxRiskPerTrade: 2,
        maxDailyLoss: 5,
        maxOpenPositions: 2,
        allowedSymbols: ["BTC-USD"],
      },
    });
    await runtime.tick({ symbol: "BTC-USD", timeframe: "1d" });
    expect(runtime.snapshot().trades).toBe(1);
    expect(store.get("trader:journal")).toContain("paper_fill");
    expect(store.get("trader:memory:summary")).toContain('"paperFills":1');
    expect(store.has("trader:last_tick")).toBe(true);
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
