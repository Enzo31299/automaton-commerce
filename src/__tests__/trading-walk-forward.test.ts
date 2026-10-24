import { describe, expect, it } from "vitest";
import { MovingAverageCrossStrategy, type Candle } from "../trading/strategy.js";
import { walkForward } from "../trading/walk-forward.js";

function series(length: number): Candle[] {
  return Array.from({ length }, (_, index) => {
    const close = 100 + Math.sin(index / 4) * 8 + index * 0.15;
    return { timestamp: index, open: close, high: close, low: close, close };
  });
}

const strategyFactory = () => new MovingAverageCrossStrategy(2, 4);
const config = { initialCapital: 150, feeRate: 0, allocationFraction: 0.25 };

describe("walk-forward research", () => {
  it("evaluates only unseen test windows", () => {
    const result = walkForward(
      series(120),
      () => new MovingAverageCrossStrategy(3, 8),
      { initialCapital: 150, feeRate: 0.001, allocationFraction: 0.25 },
      40,
      20,
    );

    expect(result.windows.length).toBe(4);
    for (const window of result.windows) {
      expect(window.trainEnd).toBe(window.testStart);
      expect(window.testEnd - window.testStart).toBe(20);
    }
    expect(Number.isFinite(result.averageTestReturnPct)).toBe(true);
    expect(result.worstTestDrawdownPct).toBeGreaterThanOrEqual(0);
  });

  it("rejects non-positive, fractional, non-finite, and unsafe window sizes", () => {
    const sample = series(20);
    expect(() => walkForward(sample, strategyFactory, config, 0, 5)).toThrow(/positive safe integers/);
    expect(() => walkForward(sample, strategyFactory, config, 5.5, 5)).toThrow(/positive safe integers/);
    expect(() => walkForward(sample, strategyFactory, config, 5, Number.NaN)).toThrow(/positive safe integers/);
    expect(() => walkForward(sample, strategyFactory, config, 5, Number.POSITIVE_INFINITY)).toThrow(/positive safe integers/);
    expect(() => walkForward(sample, strategyFactory, config, Number.MAX_SAFE_INTEGER + 1, 5)).toThrow(/positive safe integers/);
  });
});
