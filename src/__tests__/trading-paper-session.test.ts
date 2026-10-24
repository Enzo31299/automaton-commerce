import { describe, expect, it } from "vitest";
import type { ExecutionAdapter } from "../trading/execution.js";
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

function createSession(initialEquity = 150) {
  return new PaperTradingSession(
    { eligible: true, reasons: [] },
    initialEquity,
    new TradingRiskEngine(limits),
    new PaperExecutionAdapter(),
  );
}

describe("paper trading session", () => {
  it("cannot start when research gate rejects a strategy", () => {
    expect(() => new PaperTradingSession(
      { eligible: false, reasons: ["drawdown_limit_exceeded"] },
      150,
      new TradingRiskEngine(limits),
      new PaperExecutionAdapter(),
    )).toThrow(/Research gate blocked/);
  });

  it("rejects non-finite or non-positive initial equity", () => {
    for (const initialEquity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createSession(initialEquity)).toThrow(/Initial equity/);
    }
  });

  it("routes simulated trades through the hard risk engine", async () => {
    const session = createSession();
    const blocked = await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 1, price: 100 });
    expect(blocked).toBeNull();
    expect(session.snapshot().blockedTrades).toBe(1);

    const filled = await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.25, price: 100 });
    expect(filled).toMatchObject({ mode: "paper", symbol: "BTC-USD", side: "buy", quantity: 0.25, fillPrice: 100, notional: 25 });
    expect(session.snapshot().trades).toBe(1);
  });

  it("rejects malformed execution fills without mutating capital", async () => {
    const malformed: ExecutionAdapter = {
      async execute(intent) {
        return {
          id: "bad-fill",
          mode: "paper",
          symbol: intent.symbol,
          side: intent.side,
          quantity: intent.quantity,
          fillPrice: intent.price,
          notional: Number.NaN,
          fee: 0,
          timestamp: Date.now(),
        };
      },
    };
    const session = new PaperTradingSession(
      { eligible: true, reasons: [] },
      150,
      new TradingRiskEngine(limits),
      malformed,
    );
    const before = session.snapshot();
    expect(await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.25, price: 100 })).toBeNull();
    const after = session.snapshot();
    expect(after.cash).toBe(before.cash);
    expect(after.equity).toBe(before.equity);
    expect(after.positions).toEqual(before.positions);
    expect(after.trades).toBe(before.trades);
    expect(after.blockedTrades).toBe(before.blockedTrades + 1);
  });

  it("ignores non-positive mark prices instead of corrupting equity", async () => {
    const session = createSession();
    await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.25, price: 100 });
    const before = session.snapshot().equity;
    session.markToMarket({ "BTC-USD": -1 });
    expect(session.snapshot().equity).toBe(before);
  });

  it("tracks simulated equity and daily loss", () => {
    const session = createSession();
    session.recordPnl(-3);
    expect(session.snapshot()).toMatchObject({ equity: 147, dailyPnl: -3 });
    session.resetDailyPnl();
    expect(session.snapshot().dailyPnl).toBe(0);
  });

  it("rejects manual pnl adjustments that would make capital negative without mutation", () => {
    const session = createSession();
    const before = session.snapshot();
    expect(() => session.recordPnl(-151)).toThrow(/capital negative/);
    expect(session.snapshot()).toEqual(before);
  });
});
