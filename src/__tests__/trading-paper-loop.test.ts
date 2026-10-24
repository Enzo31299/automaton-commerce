import { describe, expect, it } from "vitest";
import { InMemoryMarketDataProvider } from "../trading/market-data.js";
import { PaperExecutionAdapter } from "../trading/execution.js";
import { PaperTradingLoop } from "../trading/paper-loop.js";
import { PaperTradingSession } from "../trading/paper-session.js";
import { TradingRiskEngine } from "../trading/risk-engine.js";
import type { Candle, Strategy } from "../trading/strategy.js";

const candle = (close: number, timestamp: number): Candle => ({
  timestamp, open: close, high: close, low: close, close,
});

const buyStrategy: Strategy = { name: "always-buy-test", signal: () => "buy" };
const sellStrategy: Strategy = { name: "always-sell-test", signal: () => "sell" };
const holdStrategy: Strategy = { name: "always-hold-test", signal: () => "hold" };

function session(maxPositionValue = 50) {
  return new PaperTradingSession(
    { eligible: true, reasons: [] },
    150,
    new TradingRiskEngine({
      maxPositionValue,
      maxRiskPerTrade: 2,
      maxDailyLoss: 5,
      maxOpenPositions: 2,
      allowedSymbols: ["BTC-USD"],
    }),
    new PaperExecutionAdapter(),
  );
}

describe("paper trading loop", () => {
  it("turns a market signal into a risk-checked paper execution", async () => {
    const provider = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [candle(100, 1), candle(101, 2)]],
    ]));
    const result = await new PaperTradingLoop(provider, buyStrategy, session(), { quantity: 0.25 })
      .tick({ symbol: "BTC-USD", timeframe: "1d" });
    expect(result).toMatchObject({ signal: "buy", submitted: true, blocked: false, price: 101 });
  });

  it("reports a signal blocked by hard risk limits", async () => {
    const provider = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [candle(100, 1)]],
    ]));
    const result = await new PaperTradingLoop(provider, buyStrategy, session(10), { quantity: 0.25 })
      .tick({ symbol: "BTC-USD", timeframe: "1d" });
    expect(result).toMatchObject({ signal: "buy", submitted: false, blocked: true });
  });

  it("does not submit anything on hold", async () => {
    const provider = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [candle(100, 1)]],
    ]));
    const result = await new PaperTradingLoop(provider, holdStrategy, session(), { quantity: 0.25 })
      .tick({ symbol: "BTC-USD", timeframe: "1d" });
    expect(result).toEqual({ signal: "hold", submitted: false, blocked: false });
  });

  it("turns repeated buy signals into hold while already long", async () => {
    const provider = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [candle(100, 1)]],
    ]));
    const paperSession = session();
    const loop = new PaperTradingLoop(provider, buyStrategy, paperSession, { quantity: 0.25 });
    expect((await loop.tick({ symbol: "BTC-USD", timeframe: "1d" })).submitted).toBe(true);
    expect(await loop.tick({ symbol: "BTC-USD", timeframe: "1d" })).toEqual({ signal: "hold", submitted: false, blocked: false });
    expect(paperSession.snapshot().positions["BTC-USD"]?.quantity).toBe(0.25);
  });

  it("turns sell into hold when there is no long position", async () => {
    const provider = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [candle(100, 1)]],
    ]));
    const result = await new PaperTradingLoop(provider, sellStrategy, session(), { quantity: 0.25 })
      .tick({ symbol: "BTC-USD", timeframe: "1d" });
    expect(result).toEqual({ signal: "hold", submitted: false, blocked: false });
  });

  it("closes the full long position on sell", async () => {
    const provider = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [candle(100, 1)]],
    ]));
    const paperSession = session();
    await paperSession.submit({ symbol: "BTC-USD", side: "buy", quantity: 0.4, price: 100 });
    const result = await new PaperTradingLoop(provider, sellStrategy, paperSession, { quantity: 0.25 })
      .tick({ symbol: "BTC-USD", timeframe: "1d" });
    expect(result).toMatchObject({ signal: "sell", submitted: true, blocked: false, price: 100 });
    expect(paperSession.snapshot().positions["BTC-USD"]).toBeUndefined();
  });

  it("rejects invalid quantity and stop-loss configuration", () => {
    const provider = new InMemoryMarketDataProvider(new Map());
    expect(() => new PaperTradingLoop(provider, buyStrategy, session(), { quantity: Number.NaN }))
      .toThrow(/finite positive/);
    expect(() => new PaperTradingLoop(provider, buyStrategy, session(), { quantity: 0.25, stopLossFraction: 0 }))
      .toThrow(/between 0 and 1/);
    expect(() => new PaperTradingLoop(provider, buyStrategy, session(), { quantity: 0.25, stopLossFraction: 1 }))
      .toThrow(/between 0 and 1/);
  });

  it("blocks a signal when the latest market price is invalid", async () => {
    const provider = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1d", [candle(0, 1)]],
    ]));
    const paperSession = session();
    const before = paperSession.snapshot();
    const result = await new PaperTradingLoop(provider, buyStrategy, paperSession, { quantity: 0.25 })
      .tick({ symbol: "BTC-USD", timeframe: "1d" });
    expect(result).toMatchObject({ signal: "buy", submitted: false, blocked: true, price: 0 });
    expect(paperSession.snapshot()).toEqual(before);
  });
});
