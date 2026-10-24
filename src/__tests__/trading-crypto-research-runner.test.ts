import { describe, expect, it } from "vitest";
import { runCryptoResearch } from "../trading/crypto-research-runner.js";

const gate = { minWindows: 2, minProfitableWindowRatio: 0, maxDrawdownPct: 100, minAverageTestReturnPct: -100 };

function researchConfig(backtest: { initialCapital: number; feeRate: number; allocationFraction: number; slippageRate?: number }) {
  return {
    symbols: ["BTC-USD", "ETH-USD"],
    timeframe: "1d" as const,
    start: 0,
    end: 240 * 86400,
    trainSize: 120,
    testSize: 60,
    backtest,
    gate,
  };
}

describe("crypto research runner", () => {
  it("runs quality, comparison and paper gate for BTC/ETH with explicit trading costs", async () => {
    const rows = Array.from({ length: 240 }, (_, i) => {
      const t = i * 86400;
      const p = 100 + i * 0.2 + Math.sin(i / 8) * 3;
      return [t, p - 1, p + 1, p, p, 1];
    }).reverse();
    const fetchFn = async () => ({ ok: true, status: 200, json: async () => rows });
    const result = await runCryptoResearch(researchConfig({
      initialCapital: 150,
      feeRate: 0.001,
      allocationFraction: 0.25,
      slippageRate: 0.0005,
    }), fetchFn as any);
    expect(result).toHaveLength(2);
    expect(result[0].rows.map((x) => x.strategy)).toEqual(expect.arrayContaining(["ma-20-50", "momentum-20-2"]));
    expect(result[0].decisions["ma-20-50"]).toBeDefined();
  });

  it("fails closed when research omits fees or slippage", async () => {
    await expect(runCryptoResearch(researchConfig({
      initialCapital: 150,
      feeRate: 0,
      allocationFraction: 0.25,
      slippageRate: 0.0005,
    }))).rejects.toThrow(/positive feeRate/);

    await expect(runCryptoResearch(researchConfig({
      initialCapital: 150,
      feeRate: 0.001,
      allocationFraction: 0.25,
    }))).rejects.toThrow(/positive slippageRate/);
  });
});
