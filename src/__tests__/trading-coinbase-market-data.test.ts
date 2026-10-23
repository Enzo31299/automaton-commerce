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

  it("rejects malformed or unsafe candles returned by Coinbase", async () => {
    const invalidOhlc = async () => new Response(JSON.stringify([
      [1, 110, 100, 105, 106, 1],
    ]), { status: 200 });
    await expect(new CoinbaseExchangeMarketDataProvider(invalidOhlc)
      .getCandles({ symbol: "BTC-USD", timeframe: "1d" }))
      .rejects.toThrow(/Invalid OHLC/);

    const invalidPrice = async () => new Response(JSON.stringify([
      [1, 0, 100, 50, 60, 1],
    ]), { status: 200 });
    await expect(new CoinbaseExchangeMarketDataProvider(invalidPrice)
      .getCandles({ symbol: "BTC-USD", timeframe: "1d" }))
      .rejects.toThrow(/positive/);
  });

  it("validates request bounds before contacting Coinbase", async () => {
    let calls = 0;
    const fetcher = async () => { calls += 1; return new Response("[]", { status: 200 }); };
    const provider = new CoinbaseExchangeMarketDataProvider(fetcher);
    await expect(provider.getCandles({ symbol: "BTC-USD", timeframe: "1d", start: 20, end: 10 }))
      .rejects.toThrow(/start/);
    await expect(provider.getCandles({ symbol: "BTC-USD", timeframe: "1d", limit: 0 }))
      .rejects.toThrow(/limit/);
    await expect(provider.getCandles({ symbol: " ", timeframe: "1d" }))
      .rejects.toThrow(/symbol/);
    expect(calls).toBe(0);
  });
});
