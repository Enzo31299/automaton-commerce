import { describe, expect, it } from "vitest";
import { PaperExecutionAdapter } from "../trading/execution.js";
import { PaperTradingSession } from "../trading/paper-session.js";
import { TradingRiskEngine } from "../trading/risk-engine.js";

const limits = {
  maxPositionValue: 50,
  maxRiskPerTrade: 2,
  maxDailyLoss: 5,
  maxOpenPositions: 2,
  allowedSymbols: ["BTC-USD"],
};

describe("paper trading session", () => {
  it("cannot start when research gate rejects a strategy", () => {
    expect(() => new PaperTradingSession(
      { eligible: false, reasons: ["drawdown_limit_exceeded"] },
      150,
      new TradingRiskEngine(limits),
      new PaperExecutionAdapter(),
    )).toThrow(/Research gate blocked/);
  });

  it("routes simulated trades through the hard risk engine", async () => {
    const session = new PaperTradingSession(
      { eligible: true, reasons: [] },
      150,
      new TradingRiskEngine(limits),
      new PaperExecutionAdapter(),
    );
    const blocked = await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 1, price: 100 });
    expect(blocked).toBeNull();
    expect(session.snapshot().blockedTrades).toBe(1);

    const filled = await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.25, price: 100 });
    expect(filled?.status).toBe("filled");
    expect(session.snapshot().trades).toBe(1);
  });

  it("tracks simulated equity and daily loss", () => {
    const session = new PaperTradingSession(
      { eligible: true, reasons: [] },
      150,
      new TradingRiskEngine(limits),
      new PaperExecutionAdapter(),
    );
    session.recordPnl(-3);
    expect(session.snapshot()).toMatchObject({ equity: 147, dailyPnl: -3 });
    session.resetDailyPnl();
    expect(session.snapshot().dailyPnl).toBe(0);
  });
});
