import { describe, expect, it } from "vitest";
import { AutomatonTrader, PaperExecutionAdapter, TradingRiskEngine } from "../trading/index.js";

const limits = {
  maxPositionValue: 50,
  maxRiskPerTrade: 2,
  maxDailyLoss: 5,
  maxOpenPositions: 2,
  allowedSymbols: ["BTC-USD", "ETH-USD"],
};

const portfolio = { equity: 150, dailyPnl: 0, openPositions: 0 };

describe("Automaton Trader V0", () => {
  it("executes an allowed intent in paper mode", async () => {
    const trader = new AutomatonTrader(new TradingRiskEngine(limits), new PaperExecutionAdapter());
    const result = await trader.process(
      { symbol: "BTC-USD", side: "buy", quantity: 0.001, price: 40000, stopLossPrice: 39000 },
      portfolio,
    );

    expect(result.risk.allowed).toBe(true);
    expect(result.execution?.mode).toBe("paper");
    expect(result.execution?.notional).toBe(40);
  });

  it("blocks a position above the notional limit", () => {
    const risk = new TradingRiskEngine(limits);
    expect(risk.evaluate(
      { symbol: "BTC-USD", side: "buy", quantity: 0.002, price: 40000 },
      portfolio,
    )).toEqual({ allowed: false, reason: "position_value_limit" });
  });

  it("blocks a symbol outside the allowlist", () => {
    const risk = new TradingRiskEngine(limits);
    expect(risk.evaluate(
      { symbol: "DOGE-USD", side: "buy", quantity: 1, price: 0.2 },
      portfolio,
    )).toEqual({ allowed: false, reason: "symbol_not_allowed" });
  });

  it("blocks trading after the daily loss limit", () => {
    const risk = new TradingRiskEngine(limits);
    expect(risk.evaluate(
      { symbol: "ETH-USD", side: "buy", quantity: 0.01, price: 2000 },
      { ...portfolio, dailyPnl: -5 },
    )).toEqual({ allowed: false, reason: "daily_loss_limit" });
  });
});
