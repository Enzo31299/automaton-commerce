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
  if (candidates.length === 0) throw new Error("Strategy comparison requires at least one candidate");
  const names = new Set<string>();
  for (const candidate of candidates) {
    const name = candidate.name.trim();
    if (!name) throw new Error("Strategy candidate name must be non-empty");
    if (names.has(name)) throw new Error(`Duplicate strategy candidate name: ${name}`);
    names.add(name);
  }

  return candidates.map((candidate) => {
    const result = walkForward(candles, () => candidate.create(), config, trainSize, testSize);
    const profitableRatio = result.windows.length === 0 ? 0 : result.profitableWindows / result.windows.length;
    const robustnessScore =
      result.averageTestReturnPct -
      result.worstTestDrawdownPct +
      profitableRatio * 5;
    if (!Number.isFinite(robustnessScore)) {
      throw new Error(`Non-finite robustness score for strategy: ${candidate.name.trim()}`);
    }
    return { name: candidate.name.trim(), result, robustnessScore };
  }).sort((a, b) => b.robustnessScore - a.robustnessScore);
}
