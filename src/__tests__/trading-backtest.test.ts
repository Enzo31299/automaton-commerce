import { describe, expect, it } from "vitest";
import { backtest } from "../trading/backtest.js";
import { MovingAverageCrossStrategy, type Candle } from "../trading/strategy.js";

function candles(prices: number[]): Candle[] {
  return prices.map((close, index) => ({
    timestamp: index,
    open: close,
    high: close,
    low: close,
    close,
  }));
}

describe("trading research", () => {
  it("keeps capital unchanged when no signal can be formed", () => {
    const result = backtest(candles([100, 101, 102]), new MovingAverageCrossStrategy(2, 4), {
      initialCapital: 150,
      feeRate: 0.001,
      allocationFraction: 0.25,
    });
    expect(result.finalEquity).toBe(150);
    expect(result.trades).toBe(0);
  });

  it("reports return and drawdown metrics", () => {
    const strategy = new MovingAverageCrossStrategy(2, 3);
    const result = backtest(
      candles([10, 9, 8, 9, 10, 11, 10, 9, 8]),
      strategy,
      { initialCapital: 150, feeRate: 0, allocationFraction: 0.25 },
    );
    expect(Number.isFinite(result.netReturnPct)).toBe(true);
    expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(result.trades).toBeGreaterThanOrEqual(0);
  });
});
