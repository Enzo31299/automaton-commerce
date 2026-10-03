import { describe, expect, it } from "vitest";
import { InMemoryMarketDataProvider, validateMarketSeries } from "../trading/market-data.js";
import { researchMarkets } from "../trading/research.js";
import { MovingAverageCrossStrategy, type Candle } from "../trading/strategy.js";

function candles(length: number, offset = 0): Candle[] {
  return Array.from({ length }, (_, i) => {
    const close = offset + 100 + Math.sin(i / 3) * 4 + i * 0.1;
    return { timestamp: i + 1, open: close, high: close + 1, low: close - 1, close };
  });
}

describe("market data research", () => {
  it("loads multiple markets through a provider abstraction", async () => {
    const provider = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", candles(100)],
      ["ETH-USD:1d", candles(100, 50)],
    ]));
    const results = await researchMarkets(
      provider,
      [{ symbol: "BTC-USD", timeframe: "1d" }, { symbol: "ETH-USD", timeframe: "1d" }],
      () => new MovingAverageCrossStrategy(3, 8),
      { initialCapital: 150, feeRate: 0.001, allocationFraction: 0.25 },
      40,
      20,
    );
    expect(results).toHaveLength(2);
    expect(results.map((x) => x.symbol)).toEqual(["BTC-USD", "ETH-USD"]);
    expect(results.every((x) => x.result.windows.length > 0)).toBe(true);
  });

  it("rejects malformed chronological data", () => {
    const data = candles(3);
    data[2] = { ...data[2], timestamp: data[1].timestamp };
    expect(() => validateMarketSeries({ symbol: "X", timeframe: "1d", candles: data, source: "test" })).toThrow();
  });
});
