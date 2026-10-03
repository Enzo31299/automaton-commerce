import { describe, expect, it } from "vitest";
import { compareStrategies } from "../trading/strategy-comparison.js";
import { MomentumStrategy } from "../trading/momentum-strategy.js";
import { MovingAverageCrossStrategy, type Candle } from "../trading/strategy.js";

const candles: Candle[] = Array.from({ length: 240 }, (_, i) => {
  const close = 100 + Math.sin(i / 6) * 9 + i * 0.12;
  return { timestamp: i + 1, open: close, high: close + 1, low: close - 1, close };
});

describe("strategy comparison", () => {
  it("compares candidates using out-of-sample robustness metrics", () => {
    const results = compareStrategies(candles, [
      { name: "ma-cross", create: () => new MovingAverageCrossStrategy(5, 15) },
      { name: "momentum", create: () => new MomentumStrategy(10, 1) },
    ], { initialCapital: 150, feeRate: 0.001, allocationFraction: 0.25 }, 120, 60);
    expect(results).toHaveLength(2);
    expect(results.every((x) => Number.isFinite(x.robustnessScore))).toBe(true);
    expect(results[0].robustnessScore).toBeGreaterThanOrEqual(results[1].robustnessScore);
  });
});
