import { describe, expect, it } from "vitest";
import { TradingMemory } from "../trading/trading-memory.js";

describe("trading memory", () => {
  it("learns observations without containing mutable risk limits", () => {
    const store = new Map<string, string>();
    const memory = new TradingMemory({
      getKV: (key) => store.get(key),
      setKV: (key, value) => { store.set(key, value); },
    });
    const summary = memory.observe([
      { timestamp: 1, type: "paper_fill", symbol: "BTC-USD", details: {} },
      { timestamp: 2, type: "risk_block", symbol: "BTC-USD", details: {} },
    ], 3);
    expect(summary).toMatchObject({ observations: 2, paperFills: 1, riskBlocks: 1 });
    expect(JSON.stringify(summary)).not.toContain("maxDailyLoss");
    expect(JSON.stringify(summary)).not.toContain("maxRiskPerTrade");
  });
});
