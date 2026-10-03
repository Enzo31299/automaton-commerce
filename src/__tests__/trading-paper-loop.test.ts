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
});
