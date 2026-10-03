import { describe, expect, it } from "vitest";
import { evaluatePaperTradingEligibility } from "../trading/paper-trading-gate.js";

const gate = {
  minWindows: 4,
  minProfitableWindowRatio: 0.5,
  maxDrawdownPct: 10,
  minAverageTestReturnPct: 0,
};

describe("paper trading research gate", () => {
  it("allows only strategies meeting all research constraints", () => {
    const decision = evaluatePaperTradingEligibility({
      market: "BTC-USD",
      strategy: "momentum",
      averageTestReturnPct: 2,
      worstTestDrawdownPct: 6,
      profitableWindows: 3,
      totalWindows: 4,
      robustnessScore: 1,
    }, gate);
    expect(decision).toEqual({ eligible: true, reasons: [] });
  });

  it("explains why a strategy is blocked", () => {
    const decision = evaluatePaperTradingEligibility({
      market: "ETH-USD",
      strategy: "ma-cross",
      averageTestReturnPct: -1,
      worstTestDrawdownPct: 14,
      profitableWindows: 1,
      totalWindows: 3,
      robustnessScore: -10,
    }, gate);
    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toContain("insufficient_out_of_sample_windows");
    expect(decision.reasons).toContain("drawdown_limit_exceeded");
  });
});
