import { describe, expect, it } from "vitest";
import { backtest } from "../trading/backtest.js";
import { MovingAverageCrossStrategy, type Candle, type Strategy } from "../trading/strategy.js";

function candles(prices: number[]): Candle[] {
  return prices.map((close, index) => ({
    timestamp: index,
    open: close,
    high: close,
    low: close,
    close,
  }));
}

const config = { initialCapital: 150, feeRate: 0.001, allocationFraction: 0.25 };

describe("trading research", () => {
  it("keeps capital unchanged when no signal can be formed", () => {
    const result = backtest(candles([100, 101, 102]), new MovingAverageCrossStrategy(2, 4), config);
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

  it("executes a close-derived signal only at the next candle open", () => {
    const sample: Candle[] = [
      { timestamp: 0, open: 100, high: 100, low: 100, close: 100 },
      { timestamp: 1, open: 200, high: 200, low: 200, close: 200 },
    ];
    const buyImmediately: Strategy = { signal: () => "buy" };
    const result = backtest(sample, buyImmediately, { initialCapital: 100, feeRate: 0, allocationFraction: 1 });

    // If the signal were incorrectly filled on the signal candle close (100),
    // final equity would be 200. A next-open fill at 200 leaves it at 100.
    expect(result.finalEquity).toBe(100);
  });

  it("does not execute a signal when there is no following candle", () => {
    const buyImmediately: Strategy = { signal: () => "buy" };
    const result = backtest(candles([100]), buyImmediately, { initialCapital: 100, feeRate: 0, allocationFraction: 1 });
    expect(result.finalEquity).toBe(100);
    expect(result.trades).toBe(0);
  });

  it("rejects invalid capital, fees, allocation, and evaluation boundaries", () => {
    const strategy = new MovingAverageCrossStrategy(2, 3);
    const sample = candles([10, 11, 12]);
    expect(() => backtest(sample, strategy, { ...config, initialCapital: 0 })).toThrow(/initialCapital/);
    expect(() => backtest(sample, strategy, { ...config, feeRate: 1 })).toThrow(/feeRate/);
    expect(() => backtest(sample, strategy, { ...config, allocationFraction: 1.01 })).toThrow(/allocationFraction/);
    expect(() => backtest(sample, strategy, config, { tradeStartIndex: 1.5 })).toThrow(/tradeStartIndex/);
  });

  it("rejects malformed OHLC data and non-monotonic timestamps", () => {
    const strategy = new MovingAverageCrossStrategy(2, 3);
    const malformed = candles([10, 11, 12]);
    malformed[1] = { ...malformed[1], high: 9 };
    expect(() => backtest(malformed, strategy, config)).toThrow(/OHLC/);

    const duplicate = candles([10, 11, 12]);
    duplicate[2] = { ...duplicate[2], timestamp: duplicate[1].timestamp };
    expect(() => backtest(duplicate, strategy, config)).toThrow(/timestamps/);
  });
});
