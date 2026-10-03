import { describe, expect, it } from "vitest";
import { MovingAverageCrossStrategy, type Candle } from "../trading/strategy.js";
import { walkForward } from "../trading/walk-forward.js";

function series(length: number): Candle[] {
  return Array.from({ length }, (_, index) => {
    const close = 100 + Math.sin(index / 4) * 8 + index * 0.15;
    return { timestamp: index, open: close, high: close, low: close, close };
  });
}

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

  it("rejects invalid window sizes", () => {
    expect(() => walkForward(series(20), () => new MovingAverageCrossStrategy(2, 4), {
      initialCapital: 150,
      feeRate: 0,
      allocationFraction: 0.25,
    }, 0, 5)).toThrow();
  });
});
