import type { PaperServiceConfig } from "./paper-service-config.js";
import { PAPER_SERVICE_STRATEGY, PAPER_SERVICE_SYMBOLS, PAPER_SERVICE_TIMEFRAME } from "./paper-service-config.js";
import type { PaperResearchPolicy } from "./research-policy.js";

function sameSymbols(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((symbol) => actual.includes(symbol));
}

export function assertResearchPolicyCompatible(
  policy: PaperResearchPolicy,
  config: PaperServiceConfig,
): void {
  if (policy.strategy !== PAPER_SERVICE_STRATEGY) throw new Error("Persisted research strategy is incompatible with paper service");
  if (policy.timeframe !== PAPER_SERVICE_TIMEFRAME) throw new Error("Persisted research timeframe is incompatible with paper service");
  if (!sameSymbols(policy.symbols, PAPER_SERVICE_SYMBOLS)) throw new Error("Persisted research markets are incompatible with paper service");
  if (policy.feeRate !== config.execution.feeRate) throw new Error("Persisted research fee rate is incompatible with paper service");
  if (policy.slippageRate !== config.execution.slippageRate) throw new Error("Persisted research slippage rate is incompatible with paper service");
  if (policy.initialCapital !== config.initialEquity) throw new Error("Persisted research capital is incompatible with paper service");
}
