import { describe, expect, it } from "vitest";
import { downloadCoinbaseHistory } from "../trading/coinbase-history.js";

describe("Coinbase historical downloader", () => {
  it("chunks, deduplicates and sorts historical candles", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return {
        ok: true, status: 200,
        json: async () => calls === 1
          ? [[300, 9, 12, 10, 11, 1], [0, 8, 11, 9, 10, 1]]
          : [[300, 9, 12, 10, 11, 1], [600, 10, 13, 11, 12, 1]],
      };
    };
    const candles = await downloadCoinbaseHistory(
      { symbol: "BTC-USD", timeframe: "1m", start: 0, end: 36000 },
      fetchFn as any,
      "https://example.test",
    );
    expect(calls).toBe(2);
    expect(candles.map((c) => c.timestamp)).toEqual([0, 300, 600]);
  });
});
