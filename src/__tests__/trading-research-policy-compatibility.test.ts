import { describe, expect, it } from "vitest";
import { createPaperServiceConfig } from "../trading/paper-service-config.js";
import { assertResearchPolicyCompatible } from "../trading/research-policy-compatibility.js";
import { createPaperResearchPolicy } from "../trading/research-policy.js";

function config(overrides: NodeJS.ProcessEnv = {}) {
  return createPaperServiceConfig({ TRADER_DB_PATH: "state.db", ...overrides });
}

describe("research policy compatibility", () => {
  it("accepts the canonical OOS policy with default paper configuration", () => {
    expect(() => assertResearchPolicyCompatible(createPaperResearchPolicy(), config())).not.toThrow();
  });

  it("rejects execution cost drift", () => {
    expect(() => assertResearchPolicyCompatible(createPaperResearchPolicy(), config({ TRADER_FEE_RATE: "0.002" })))
      .toThrow(/fee rate/);
    expect(() => assertResearchPolicyCompatible(createPaperResearchPolicy(), config({ TRADER_SLIPPAGE_RATE: "0.001" })))
      .toThrow(/slippage rate/);
  });

  it("rejects capital drift", () => {
    expect(() => assertResearchPolicyCompatible(createPaperResearchPolicy(), config({ TRADER_INITIAL_EQUITY: "200" })))
      .toThrow(/capital/);
  });

  it("rejects strategy, timeframe and market drift", () => {
    const strategy = { ...createPaperResearchPolicy(), strategy: "momentum-10-1" as any };
    const timeframe = { ...createPaperResearchPolicy(), timeframe: "1d" as any };
    const markets = { ...createPaperResearchPolicy(), symbols: ["BTC-USD", "ETH-USD"] };
    expect(() => assertResearchPolicyCompatible(strategy, config())).toThrow(/strategy/);
    expect(() => assertResearchPolicyCompatible(timeframe, config())).toThrow(/timeframe/);
    expect(() => assertResearchPolicyCompatible(markets, config())).toThrow(/markets/);
  });
});
