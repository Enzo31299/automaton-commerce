import { describe, expect, it } from "vitest";
import { compareStrategies } from "../trading/strategy-comparison.js";
import { MomentumStrategy } from "../trading/momentum-strategy.js";
import { MovingAverageCrossStrategy, type Candle } from "../trading/strategy.js";

const candles: Candle[] = Array.from({ length: 240 }, (_, i) => {
  const close = 100 + Math.sin(i / 6) * 9 + i * 0.12;
  return { timestamp: i + 1, open: close, high: close + 1, low: close - 1, close };
});

const backtest = { initialCapital: 150, feeRate: 0.001, allocationFraction: 0.25, slippageRate: 0.0005 };

describe("strategy comparison", () => {
  it("compares candidates using out-of-sample robustness metrics", () => {
    const results = compareStrategies(candles, [
      { name: "ma-cross", create: () => new MovingAverageCrossStrategy(5, 15) },
      { name: "momentum", create: () => new MomentumStrategy(10, 1) },
    ], backtest, 120, 60);
    expect(results).toHaveLength(2);
    expect(results.every((x) => Number.isFinite(x.robustnessScore))).toBe(true);
    expect(results[0].robustnessScore).toBeGreaterThanOrEqual(results[1].robustnessScore);
  });

  it("rejects empty, blank and duplicate candidate sets", () => {
    expect(() => compareStrategies(candles, [], backtest, 120, 60)).toThrow(/at least one candidate/);
    expect(() => compareStrategies(candles, [
      { name: "   ", create: () => new MomentumStrategy(10, 1) },
    ], backtest, 120, 60)).toThrow(/name must be non-empty/);
    expect(() => compareStrategies(candles, [
      { name: "momentum", create: () => new MomentumStrategy(10, 1) },
      { name: "momentum", create: () => new MovingAverageCrossStrategy(5, 15) },
    ], backtest, 120, 60)).toThrow(/Duplicate strategy candidate name/);
  });
});
