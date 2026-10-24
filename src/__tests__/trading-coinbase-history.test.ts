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

  it("retries transient rate-limit failures with bounded backoff", async () => {
    let calls = 0;
    const delays: number[] = [];
    const fetchFn = async () => {
      calls += 1;
      if (calls < 3) return { ok: false, status: 429, json: async () => [] };
      return { ok: true, status: 200, json: async () => [[0, 8, 11, 9, 10, 1]] };
    };
    const candles = await downloadCoinbaseHistory(
      { symbol: "BTC-USD", timeframe: "1m", start: 0, end: 60 },
      fetchFn as any,
      "https://example.test",
      async (ms) => { delays.push(ms); },
    );
    expect(calls).toBe(3);
    expect(delays).toEqual([250, 500]);
    expect(candles).toHaveLength(1);
  });

  it("does not retry permanent client failures", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return { ok: false, status: 400, json: async () => [] };
    };
    await expect(downloadCoinbaseHistory(
      { symbol: "BTC-USD", timeframe: "1m", start: 0, end: 60 },
      fetchFn as any,
      "https://example.test",
      async () => undefined,
    )).rejects.toThrow(/400/);
    expect(calls).toBe(1);
  });

  it("rejects invalid epoch ranges before making a request", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => [] };
    };
    await expect(downloadCoinbaseHistory(
      { symbol: "BTC-USD", timeframe: "1h", start: Number.NaN, end: 60 },
      fetchFn as any,
    )).rejects.toThrow(/epoch seconds/);
    expect(calls).toBe(0);
  });

  it("rejects millisecond timestamps before making a request", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => [] };
    };
    const nowMs = Date.now();
    await expect(downloadCoinbaseHistory(
      { symbol: "BTC-USD", timeframe: "1h", start: nowMs - 3_600_000, end: nowMs },
      fetchFn as any,
    )).rejects.toThrow(/epoch seconds/);
    expect(calls).toBe(0);
  });
});
