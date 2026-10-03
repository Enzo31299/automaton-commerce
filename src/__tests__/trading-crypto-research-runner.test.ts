import { describe, expect, it } from "vitest";
import { runCryptoResearch } from "../trading/crypto-research-runner.js";

describe("crypto research runner", () => {
  it("runs quality, comparison and paper gate for BTC/ETH", async () => {
    const rows = Array.from({ length: 240 }, (_, i) => {
      const t = i * 86400;
      const p = 100 + i * 0.2 + Math.sin(i / 8) * 3;
      return [t, p - 1, p + 1, p, p, 1];
    }).reverse();
    const fetchFn = async () => ({ ok: true, status: 200, json: async () => rows });
    const result = await runCryptoResearch({
      symbols: ["BTC-USD", "ETH-USD"],
      timeframe: "1d",
      start: 0,
      end: 240 * 86400,
      trainSize: 120,
      testSize: 60,
      backtest: { initialCapital: 150, feeRate: 0.001, allocationFraction: 0.25 },
      gate: { minWindows: 2, minProfitableWindowRatio: 0, maxDrawdownPct: 100, minAverageTestReturnPct: -100 },
    }, fetchFn as any);
    expect(result).toHaveLength(2);
    expect(result[0].rows.map((x) => x.strategy)).toEqual(expect.arrayContaining(["ma-20-50", "momentum-20-2"]));
    expect(result[0].decisions["ma-20-50"]).toBeDefined();
  });
});
