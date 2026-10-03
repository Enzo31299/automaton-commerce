import { describe, expect, it } from "vitest";
import { runPublicCryptoResearch } from "../trading/public-crypto-research.js";
import { InMemoryMarketDataProvider } from "../trading/market-data.js";
import type { Candle } from "../trading/strategy.js";

function data(offset: number): Candle[] {
  return Array.from({ length: 240 }, (_, i) => {
    const close = offset + 100 + Math.sin(i / 8) * 10 + i * 0.08;
    return { timestamp: i + 1, open: close, high: close + 1, low: close - 1, close };
  });
}

describe("public crypto research experiment", () => {
  it("runs the same out-of-sample protocol on BTC and ETH", async () => {
    const provider = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", data(0)],
      ["ETH-USD:1d", data(50)],
    ]));
    const results = await runPublicCryptoResearch(provider, {
      initialCapital: 150,
      feeRate: 0.001,
      trainSize: 120,
      testSize: 60,
    });
    expect(results.map((x) => x.symbol)).toEqual(["BTC-USD", "ETH-USD"]);
    expect(results.every((x) => x.result.windows.length === 2)).toBe(true);
  });
});
