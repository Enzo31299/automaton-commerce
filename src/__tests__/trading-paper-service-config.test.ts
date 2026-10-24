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
    expect(config.execution).toEqual({ feeRate: 0.001, slippageRate: 0.0005 });
  });

  it("requires an explicit durable database path", () => {
    expect(() => createPaperServiceConfig({})).toThrow(/TRADER_DB_PATH/);
  });

  it("fails closed on invalid capital, risk, and execution cost configuration", () => {
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_INITIAL_EQUITY: "NaN" })).toThrow();
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_MAX_OPEN_POSITIONS: "4" })).toThrow();
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_POLL_INTERVAL_MS: "9999" })).toThrow();
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_FEE_RATE: "0" })).toThrow(/TRADER_FEE_RATE/);
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_FEE_RATE: "1" })).toThrow(/TRADER_FEE_RATE/);
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_SLIPPAGE_RATE: "0" })).toThrow(/TRADER_SLIPPAGE_RATE/);
    expect(() => createPaperServiceConfig({ TRADER_DB_PATH: "state.db", TRADER_SLIPPAGE_RATE: "NaN" })).toThrow(/TRADER_SLIPPAGE_RATE/);
  });

  it("accepts explicit realistic paper execution costs", () => {
    const config = createPaperServiceConfig({
      TRADER_DB_PATH: "state.db",
      TRADER_FEE_RATE: "0.002",
      TRADER_SLIPPAGE_RATE: "0.001",
    });
    expect(config.execution).toEqual({ feeRate: 0.002, slippageRate: 0.001 });
  });
});
