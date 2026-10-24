import { describe, expect, it } from "vitest";
import { evaluateStrategyAcrossMarkets } from "../trading/research-portfolio-gate.js";
import type { CryptoResearchMarketResult } from "../trading/crypto-research-runner.js";

const requiredMarkets = ["BTC-USD", "ETH-USD", "SOL-USD"] as const;

function market(symbol: string, eligible: boolean): CryptoResearchMarketResult {
  return {
    symbol,
    rows: [],
    decisions: {
      momentum: eligible
        ? { eligible: true, reasons: [] }
        : { eligible: false, reasons: ["drawdown_limit_exceeded"] },
    },
  };
}

describe("cross-market research gate", () => {
  it("allows paper deployment only when the strategy is eligible on every required market", () => {
    const result = evaluateStrategyAcrossMarkets("momentum", [
      market("BTC-USD", true),
      market("ETH-USD", true),
      market("SOL-USD", true),
    ], { requiredMarkets });
    expect(result).toEqual({
      eligible: true,
      reasons: [],
      eligibleMarkets: ["BTC-USD", "ETH-USD", "SOL-USD"],
    });
  });

  it("fails closed when a required market is missing or ineligible", () => {
    const missing = evaluateStrategyAcrossMarkets("momentum", [
      market("BTC-USD", true),
      market("ETH-USD", true),
    ], { requiredMarkets });
    expect(missing.eligible).toBe(false);
    expect(missing.reasons).toContain("missing_market:SOL-USD");

    const blocked = evaluateStrategyAcrossMarkets("momentum", [
      market("BTC-USD", true),
      market("ETH-USD", false),
      market("SOL-USD", true),
    ], { requiredMarkets });
    expect(blocked.eligible).toBe(false);
    expect(blocked.reasons).toContain("market_ineligible:ETH-USD");
  });

  it("rejects invalid gate configuration and absent strategy decisions", () => {
    expect(evaluateStrategyAcrossMarkets("momentum", [], { requiredMarkets: [] })).toEqual({
      eligible: false,
      reasons: ["invalid_cross_market_gate_configuration"],
      eligibleMarkets: [],
    });

    const result = evaluateStrategyAcrossMarkets("other", [
      market("BTC-USD", true),
      market("ETH-USD", true),
      market("SOL-USD", true),
    ], { requiredMarkets });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual([
      "missing_strategy:BTC-USD",
      "missing_strategy:ETH-USD",
      "missing_strategy:SOL-USD",
    ]);
  });
});
