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

function validGate(gate: PaperTradingGate): boolean {
  return Number.isSafeInteger(gate.minWindows)
    && gate.minWindows >= 1
    && Number.isFinite(gate.minProfitableWindowRatio)
    && gate.minProfitableWindowRatio >= 0
    && gate.minProfitableWindowRatio <= 1
    && Number.isFinite(gate.maxDrawdownPct)
    && gate.maxDrawdownPct >= 0
    && Number.isFinite(gate.minAverageTestReturnPct);
}

function validResearchRow(row: ResearchReportRow): boolean {
  return row.market.trim().length > 0
    && row.strategy.trim().length > 0
    && Number.isFinite(row.averageTestReturnPct)
    && Number.isFinite(row.worstTestDrawdownPct)
    && row.worstTestDrawdownPct >= 0
    && Number.isSafeInteger(row.profitableWindows)
    && row.profitableWindows >= 0
    && Number.isSafeInteger(row.totalWindows)
    && row.totalWindows >= 0
    && row.profitableWindows <= row.totalWindows
    && Number.isFinite(row.robustnessScore);
}

export function evaluatePaperTradingEligibility(
  row: ResearchReportRow,
  gate: PaperTradingGate,
): PaperTradingDecision {
  if (!validGate(gate)) return { eligible: false, reasons: ["invalid_paper_gate_configuration"] };
  if (!validResearchRow(row)) return { eligible: false, reasons: ["invalid_research_metrics"] };

  const reasons: string[] = [];
  if (row.totalWindows < gate.minWindows) reasons.push("insufficient_out_of_sample_windows");
  const ratio = row.totalWindows === 0 ? 0 : row.profitableWindows / row.totalWindows;
  if (ratio < gate.minProfitableWindowRatio) reasons.push("insufficient_profitable_window_ratio");
  if (row.worstTestDrawdownPct > gate.maxDrawdownPct) reasons.push("drawdown_limit_exceeded");
  if (row.averageTestReturnPct < gate.minAverageTestReturnPct) reasons.push("insufficient_average_test_return");
  return { eligible: reasons.length === 0, reasons };
}
