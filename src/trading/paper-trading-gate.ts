import type { ResearchReportRow } from "./research-report.js";

export interface PaperTradingGate {
  minWindows: number;
  minProfitableWindowRatio: number;
  maxDrawdownPct: number;
  minAverageTestReturnPct: number;
}

export interface PaperTradingDecision {
  eligible: boolean;
  reasons: string[];
}

export function evaluatePaperTradingEligibility(
  row: ResearchReportRow,
  gate: PaperTradingGate,
): PaperTradingDecision {
  const reasons: string[] = [];
  if (row.totalWindows < gate.minWindows) reasons.push("insufficient_out_of_sample_windows");
  const ratio = row.totalWindows === 0 ? 0 : row.profitableWindows / row.totalWindows;
  if (ratio < gate.minProfitableWindowRatio) reasons.push("insufficient_profitable_window_ratio");
  if (row.worstTestDrawdownPct > gate.maxDrawdownPct) reasons.push("drawdown_limit_exceeded");
  if (row.averageTestReturnPct < gate.minAverageTestReturnPct) reasons.push("insufficient_average_test_return");
  return { eligible: reasons.length === 0, reasons };
}
