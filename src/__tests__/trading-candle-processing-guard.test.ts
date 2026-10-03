import { describe, expect, it } from "vitest";
import { CandleProcessingGuard } from "../trading/candle-processing-guard.js";

describe("candle processing guard", () => {
  it("allows only candles newer than the persisted timestamp", () => {
    const kv = new Map<string, string>();
    const guard = new CandleProcessingGuard({ getKV: (k) => kv.get(k), setKV: (k, v) => { kv.set(k, v); } });
    expect(guard.shouldProcess("BTC-USD", "1h", 100)).toBe(true);
    guard.markProcessed("BTC-USD", "1h", 100);
    expect(guard.shouldProcess("BTC-USD", "1h", 100)).toBe(false);
    expect(guard.shouldProcess("BTC-USD", "1h", 99)).toBe(false);
    expect(guard.shouldProcess("BTC-USD", "1h", 101)).toBe(true);
  });
});
