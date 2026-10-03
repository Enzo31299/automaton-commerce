import { backtest, type BacktestConfig, type BacktestMetrics } from "./backtest.js";
import type { Candle, Strategy } from "./strategy.js";

export interface WalkForwardWindow {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  metrics: BacktestMetrics;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  averageTestReturnPct: number;
  worstTestDrawdownPct: number;
  profitableWindows: number;
}

export function walkForward(
  candles: readonly Candle[],
  strategyFactory: (training: readonly Candle[]) => Strategy,
  config: BacktestConfig,
  trainSize: number,
  testSize: number,
): WalkForwardResult {
  if (trainSize < 1 || testSize < 1) throw new Error("trainSize and testSize must be positive");

  const windows: WalkForwardWindow[] = [];
  for (let trainStart = 0; trainStart + trainSize + testSize <= candles.length; trainStart += testSize) {
    const trainEnd = trainStart + trainSize;
    const testStart = trainEnd;
    const testEnd = testStart + testSize;
    const training = candles.slice(trainStart, trainEnd);
    const testing = candles.slice(testStart, testEnd);
    const strategy = strategyFactory(training);
    const metrics = backtest(testing, strategy, config);
    windows.push({ trainStart, trainEnd, testStart, testEnd, metrics });
  }

  const averageTestReturnPct = windows.length === 0
    ? 0
    : windows.reduce((sum, window) => sum + window.metrics.netReturnPct, 0) / windows.length;
  const worstTestDrawdownPct = windows.reduce(
    (worst, window) => Math.max(worst, window.metrics.maxDrawdownPct),
    0,
  );

  return {
    windows,
    averageTestReturnPct,
    worstTestDrawdownPct,
    profitableWindows: windows.filter((window) => window.metrics.netReturnPct > 0).length,
  };
}
