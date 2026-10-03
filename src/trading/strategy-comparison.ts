import { walkForward, type WalkForwardResult } from "./walk-forward.js";
import type { BacktestConfig } from "./backtest.js";
import type { Candle, Strategy } from "./strategy.js";

export interface StrategyCandidate {
  name: string;
  create: () => Strategy;
}

export interface StrategyComparison {
  name: string;
  result: WalkForwardResult;
  robustnessScore: number;
}

export function compareStrategies(
  candles: readonly Candle[],
  candidates: readonly StrategyCandidate[],
  config: BacktestConfig,
  trainSize: number,
  testSize: number,
): StrategyComparison[] {
  return candidates.map((candidate) => {
    const result = walkForward(candles, () => candidate.create(), config, trainSize, testSize);
    const profitableRatio = result.windows.length === 0 ? 0 : result.profitableWindows / result.windows.length;
    const robustnessScore =
      result.averageTestReturnPct -
      result.worstTestDrawdownPct +
      profitableRatio * 5;
    return { name: candidate.name, result, robustnessScore };
  }).sort((a, b) => b.robustnessScore - a.robustnessScore);
}
