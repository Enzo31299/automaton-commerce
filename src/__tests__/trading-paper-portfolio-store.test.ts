import { describe, expect, it } from "vitest";
import { PaperPortfolioStore } from "../trading/paper-portfolio-store.js";

describe("paper portfolio persistence", () => {
  it("round-trips portfolio state", () => {
    const kv = new Map<string, string>();
    const store = new PaperPortfolioStore({ getKV: (k) => kv.get(k), setKV: (k, v) => { kv.set(k, v); } });
    const state = {
      initialEquity: 150, equity: 160, cash: 100, realizedPnl: 10, dailyPnl: 10,
      openPositions: 1, trades: 2, blockedTrades: 0,
      positions: { "BTC-USD": { symbol: "BTC-USD", quantity: 0.5, averageEntryPrice: 100 } },
    };
    store.save(state, "2026-01-01T00:00:00.000Z");
    expect(store.load()).toMatchObject({ version: 1, savedAt: "2026-01-01T00:00:00.000Z", state });
  });

  it("rejects corrupt persisted state", () => {
    const store = new PaperPortfolioStore({ getKV: () => JSON.stringify({ version: 1, state: { cash: "bad" } }), setKV: () => {} });
    expect(() => store.load()).toThrow(/Corrupt/);
  });
});
