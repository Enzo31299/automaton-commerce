import { describe, expect, it } from "vitest";
import { createPaperServiceConfig } from "../trading/paper-service-config.js";

describe("paper service configuration", () => {
  it("builds a paper-only BTC ETH SOL hourly configuration", () => {
    const config = createPaperServiceConfig({ TRADER_DB_PATH: "/var/lib/automaton-trader/state.db" });
    expect(config.requests).toEqual([
      { symbol: "BTC-USD", timeframe: "1h", limit: 300 },
      { symbol: "ETH-USD", timeframe: "1h", limit: 300 },
      { symbol: "SOL-USD", timeframe: "1h", limit: 300 },
    ]);
    expect(config.initialEquity).toBe(150);
    expect(config.riskLimits.allowedSymbols).toEqual(["BTC-USD", "ETH-USD", "SOL-USD"]);
  });

  it("requires an explicit durable database path", () => {
    expect(() => createPaperServiceConfig({})).toThrow(/TRADER_DB_PATH/);
  });

  it("fails closed on invalid capital and risk configuration", () => {
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_INITIAL_EQUITY: "NaN" })).toThrow();
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_MAX_OPEN_POSITIONS: "4" })).toThrow();
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_POLL_INTERVAL_MS: "9999" })).toThrow();
  });
});
