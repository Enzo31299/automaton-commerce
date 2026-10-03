import type { StrategyComparison } from "./strategy-comparison.js";

export interface ResearchReportRow {
  market: string;
  strategy: string;
  averageTestReturnPct: number;
  worstTestDrawdownPct: number;
  profitableWindows: number;
  totalWindows: number;
  robustnessScore: number;
}

export function buildResearchReport(
  market: string,
  comparisons: readonly StrategyComparison[],
): ResearchReportRow[] {
  return comparisons.map(({ name, result, robustnessScore }) => ({
    market,
    strategy: name,
    averageTestReturnPct: result.averageTestReturnPct,
    worstTestDrawdownPct: result.worstTestDrawdownPct,
    profitableWindows: result.profitableWindows,
    totalWindows: result.windows.length,
    robustnessScore,
  }));
}

export function formatResearchReport(rows: readonly ResearchReportRow[]): string {
  const header = [
    "market",
    "strategy",
    "avg_test_return_pct",
    "worst_drawdown_pct",
    "profitable_windows",
    "total_windows",
    "robustness_score",
  ].join(",");
  const lines = rows.map((row) => [
    row.market,
    row.strategy,
    row.averageTestReturnPct.toFixed(4),
    row.worstTestDrawdownPct.toFixed(4),
    row.profitableWindows,
    row.totalWindows,
    row.robustnessScore.toFixed(4),
  ].join(","));
  return [header, ...lines].join("\n");
}
