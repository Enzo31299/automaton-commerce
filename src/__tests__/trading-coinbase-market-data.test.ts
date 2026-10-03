import { describe, expect, it } from "vitest";
import { CoinbaseExchangeMarketDataProvider } from "../trading/coinbase-market-data.js";

describe("Coinbase public market data adapter", () => {
  it("normalizes reverse-ordered exchange candles", async () => {
    const fetcher = async () => new Response(JSON.stringify([
      [3, 101, 109, 107, 102, 1],
      [2, 103, 108, 104, 107, 1],
      [1, 99, 105, 100, 104, 1],
    ]), { status: 200 });
    const provider = new CoinbaseExchangeMarketDataProvider(fetcher);
    const series = await provider.getCandles({ symbol: "BTC-USD", timeframe: "1d" });
    expect(series.candles.map((x) => x.timestamp)).toEqual([1, 2, 3]);
    expect(series.candles[0]).toMatchObject({ open: 100, high: 105, low: 99, close: 104 });
    expect(series.source).toBe("coinbase-exchange-public");
  });

  it("rejects unsupported timeframes before making a request", async () => {
    let called = false;
    const fetcher = async () => { called = true; return new Response("[]"); };
    const provider = new CoinbaseExchangeMarketDataProvider(fetcher);
    await expect(provider.getCandles({ symbol: "BTC-USD", timeframe: "2h" })).rejects.toThrow();
    expect(called).toBe(false);
  });
});
