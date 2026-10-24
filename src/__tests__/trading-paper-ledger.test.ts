import { describe, expect, it } from "vitest";
import { PaperExecutionAdapter } from "../trading/execution.js";
import { PaperTradingSession } from "../trading/paper-session.js";
import { TradingRiskEngine } from "../trading/risk-engine.js";

const eligible = { eligible: true, reasons: [] };
const limits = { maxPositionValue: 100, maxRiskPerTrade: 10, maxDailyLoss: 20, maxOpenPositions: 1, allowedSymbols: ["BTC-USD", "ETH-USD"] };

describe("paper portfolio ledger", () => {
  it("tracks cash, position, mark-to-market and realized pnl", async () => {
    const session = new PaperTradingSession(eligible, 150, new TradingRiskEngine(limits), new PaperExecutionAdapter());
    await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.5, price: 100 });
    expect(session.snapshot()).toMatchObject({ cash: 100, openPositions: 1, equity: 150 });
    session.markToMarket({ "BTC-USD": 120 });
    expect(session.snapshot().equity).toBe(160);
    await session.submit({ symbol: "BTC-USD", side: "sell", quantity: 0.5, price: 120 });
    expect(session.snapshot()).toMatchObject({ cash: 160, equity: 160, realizedPnl: 10, dailyPnl: 10, openPositions: 0 });
  });

  it("blocks selling inventory that does not exist", async () => {
    const session = new PaperTradingSession(eligible, 150, new TradingRiskEngine(limits), new PaperExecutionAdapter());
    expect(await session.submit({ symbol: "BTC-USD", side: "sell", quantity: 0.1, price: 100 })).toBeNull();
    expect(session.snapshot().blockedTrades).toBe(1);
  });

  it("enforces max open positions using the live ledger", async () => {
    const session = new PaperTradingSession(eligible, 150, new TradingRiskEngine(limits), new PaperExecutionAdapter());
    await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.1, price: 100 });
    expect(await session.submit({ symbol: "ETH-USD", side: "buy", quantity: 0.1, price: 100 })).toBeNull();
    expect(session.snapshot().openPositions).toBe(1);
  });

  it("blocks cumulative buys above max position value", async () => {
    const session = new PaperTradingSession(eligible, 150, new TradingRiskEngine({ ...limits, maxPositionValue: 50 }), new PaperExecutionAdapter());
    expect(await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.4, price: 100 })).not.toBeNull();
    expect(await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.2, price: 100 })).toBeNull();
    expect(session.snapshot().positions["BTC-USD"]?.quantity).toBe(0.4);
  });

  it("allows reducing or closing a position at max open positions", async () => {
    const session = new PaperTradingSession(eligible, 150, new TradingRiskEngine(limits), new PaperExecutionAdapter());
    await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.5, price: 100 });
    expect(await session.submit({ symbol: "BTC-USD", side: "sell", quantity: 0.5, price: 100 })).not.toBeNull();
    expect(session.snapshot().openPositions).toBe(0);
  });

  it("reconciles scaled entries, fees and partial exits when the position is flat", async () => {
    const execution = new PaperExecutionAdapter({ feeRate: 0.01, slippageRate: 0 });
    const session = new PaperTradingSession(
      eligible,
      200,
      new TradingRiskEngine({ ...limits, maxPositionValue: 200, maxRiskPerTrade: 50 }),
      execution,
    );

    await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.5, price: 100 });
    await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.5, price: 120 });
    expect(session.snapshot().positions["BTC-USD"]?.averageEntryPrice).toBeCloseTo(111.1, 10);

    await session.submit({ symbol: "BTC-USD", side: "sell", quantity: 0.4, price: 130 });
    const afterPartial = session.snapshot();
    expect(afterPartial.positions["BTC-USD"]?.quantity).toBeCloseTo(0.6, 10);
    // Cost basis includes the 1% entry fees: 50.5 + 60.6 = 111.1 total.
    // Selling 0.4 at 130 realizes 52 gross less 0.52 exit fee, against 44.44 cost basis.
    expect(afterPartial.realizedPnl).toBeCloseTo(7.04, 10);

    await session.submit({ symbol: "BTC-USD", side: "sell", quantity: 0.6, price: 90 });
    const flat = session.snapshot();
    expect(flat.positions["BTC-USD"]).toBeUndefined();
    expect(flat.openPositions).toBe(0);
    expect(flat.equity).toBeCloseTo(flat.cash, 10);
    expect(flat.realizedPnl).toBeCloseTo(flat.cash - flat.initialEquity, 10);
  });
});