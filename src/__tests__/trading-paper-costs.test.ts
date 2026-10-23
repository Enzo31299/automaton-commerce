import { describe, expect, it } from "vitest";
import { PaperExecutionAdapter } from "../trading/execution.js";
import { PaperTradingSession } from "../trading/paper-session.js";
import { TradingRiskEngine } from "../trading/risk-engine.js";

const limits = {
  maxPositionValue: 200,
  maxRiskPerTrade: 20,
  maxDailyLoss: 50,
  maxOpenPositions: 2,
  allowedSymbols: ["BTC-USD"],
};

const eligible = { eligible: true, reasons: [] };

describe("paper execution costs", () => {
  it("applies adverse slippage and fees on buys", async () => {
    const execution = new PaperExecutionAdapter({ feeRate: 0.01, slippageRate: 0.02 });
    const fill = await execution.execute({ symbol: "BTC-USD", side: "buy", quantity: 1, price: 100 });
    expect(fill.fillPrice).toBeCloseTo(102);
    expect(fill.notional).toBeCloseTo(102);
    expect(fill.fee).toBeCloseTo(1.02);
  });

  it("applies adverse slippage and fees on sells", async () => {
    const execution = new PaperExecutionAdapter({ feeRate: 0.01, slippageRate: 0.02 });
    const fill = await execution.execute({ symbol: "BTC-USD", side: "sell", quantity: 1, price: 100 });
    expect(fill.fillPrice).toBeCloseTo(98);
    expect(fill.notional).toBeCloseTo(98);
    expect(fill.fee).toBeCloseTo(0.98);
  });

  it("accounts for execution costs once and reconciles realized pnl with cash", async () => {
    const session = new PaperTradingSession(
      eligible,
      150,
      new TradingRiskEngine(limits),
      new PaperExecutionAdapter({ feeRate: 0.01, slippageRate: 0.01 }),
    );

    await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 1, price: 100 });
    const afterBuy = session.snapshot();
    expect(afterBuy.cash).toBeCloseTo(47.99);
    expect(afterBuy.realizedPnl).toBeCloseTo(0);
    expect(afterBuy.dailyPnl).toBeCloseTo(0);
    expect(afterBuy.positions["BTC-USD"]?.averageEntryPrice).toBeCloseTo(102.01);

    await session.submit({ symbol: "BTC-USD", side: "sell", quantity: 1, price: 110 });
    const afterSell = session.snapshot();
    expect(afterSell.positions["BTC-USD"]).toBeUndefined();
    expect(afterSell.cash).toBeCloseTo(155.8011);
    expect(afterSell.realizedPnl).toBeCloseTo(5.8011);
    expect(afterSell.dailyPnl).toBeCloseTo(5.8011);
    expect(afterSell.equity).toBeCloseTo(155.8011);
    expect(afterSell.realizedPnl).toBeCloseTo(afterSell.cash - afterSell.initialEquity);
  });

  it("blocks a buy when fees and slippage make the actual fill unaffordable", async () => {
    const session = new PaperTradingSession(
      eligible,
      100,
      new TradingRiskEngine(limits),
      new PaperExecutionAdapter({ feeRate: 0.01, slippageRate: 0.01 }),
    );
    const result = await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 1, price: 99 });
    expect(result).toBeNull();
    expect(session.snapshot()).toMatchObject({ cash: 100, trades: 0, blockedTrades: 1, openPositions: 0 });
  });

  it("includes expected fees and slippage in the hard position limit", async () => {
    const tightLimits = { ...limits, maxPositionValue: 100 };
    const session = new PaperTradingSession(
      eligible,
      150,
      new TradingRiskEngine(tightLimits),
      new PaperExecutionAdapter({ feeRate: 0.01, slippageRate: 0.01 }),
    );
    const result = await session.submit({ symbol: "BTC-USD", side: "buy", quantity: 1, price: 99 });
    expect(result).toBeNull();
    expect(session.snapshot()).toMatchObject({ cash: 150, trades: 0, blockedTrades: 1, openPositions: 0 });
  });

  it("includes expected fees and slippage in stop-loss risk", async () => {
    const tightLimits = { ...limits, maxRiskPerTrade: 10 };
    const session = new PaperTradingSession(
      eligible,
      150,
      new TradingRiskEngine(tightLimits),
      new PaperExecutionAdapter({ feeRate: 0.01, slippageRate: 0.01 }),
    );
    const result = await session.submit({
      symbol: "BTC-USD",
      side: "buy",
      quantity: 1,
      price: 100,
      stopLossPrice: 91,
    });
    expect(result).toBeNull();
    expect(session.snapshot()).toMatchObject({ cash: 150, trades: 0, blockedTrades: 1, openPositions: 0 });
  });
});
