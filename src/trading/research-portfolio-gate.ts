import type { CryptoResearchMarketResult } from "./crypto-research-runner.js";
import type { PaperTradingDecision } from "./paper-trading-gate.js";

export interface ResearchPortfolioGate {
  requiredMarkets: readonly string[];
}

export interface StrategyPortfolioDecision extends PaperTradingDecision {
  eligibleMarkets: string[];
}

export function evaluateStrategyAcrossMarkets(
  strategy: string,
  results: readonly CryptoResearchMarketResult[],
  gate: ResearchPortfolioGate,
): StrategyPortfolioDecision {
  const name = strategy.trim();
  const requiredMarkets = gate.requiredMarkets.map((market) => market.trim());
  if (!name || requiredMarkets.length === 0 || requiredMarkets.some((market) => !market)) {
    return { eligible: false, reasons: ["invalid_cross_market_gate_configuration"], eligibleMarkets: [] };
  }
  if (new Set(requiredMarkets).size !== requiredMarkets.length) {
    return { eligible: false, reasons: ["invalid_cross_market_gate_configuration"], eligibleMarkets: [] };
  }

  const byMarket = new Map(results.map((result) => [result.symbol, result]));
  const eligibleMarkets: string[] = [];
  const reasons: string[] = [];

  for (const market of requiredMarkets) {
    const result = byMarket.get(market);
    if (!result) {
      reasons.push(`missing_market:${market}`);
      continue;
    }
    const decision = result.decisions[name];
    if (!decision) {
      reasons.push(`missing_strategy:${market}`);
      continue;
    }
    if (!decision.eligible) {
      reasons.push(`market_ineligible:${market}`);
      continue;
    }
    eligibleMarkets.push(market);
  }

  return { eligible: reasons.length === 0, reasons, eligibleMarkets };
}
