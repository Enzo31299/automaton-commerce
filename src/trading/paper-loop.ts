import type { MarketDataProvider, MarketRequest } from "./market-data.js";
import type { PaperTradingSession } from "./paper-session.js";
import type { Strategy } from "./strategy.js";
import type { TradeIntent } from "./types.js";

export interface PaperLoopConfig {
  quantity: number;
  stopLossFraction?: number;
}

export interface PaperLoopResult {
  signal: "buy" | "sell" | "hold";
  submitted: boolean;
  blocked: boolean;
  price?: number;
}

export class PaperTradingLoop {
  constructor(
    private readonly marketData: MarketDataProvider,
    private readonly strategy: Strategy,
    private readonly session: PaperTradingSession,
    private readonly config: PaperLoopConfig,
  ) {
    if (config.quantity <= 0) throw new Error("Paper loop quantity must be positive");
  }

  async tick(request: MarketRequest): Promise<PaperLoopResult> {
    const series = await this.marketData.getCandles(request);
    if (series.candles.length === 0) return { signal: "hold", submitted: false, blocked: false };

    const signal = this.strategy.signal(series.candles);
    if (signal === "hold") return { signal, submitted: false, blocked: false };

    const price = series.candles.at(-1)!.close;
    const intent: TradeIntent = {
      symbol: request.symbol,
      side: signal,
      quantity: this.config.quantity,
      price,
      ...(this.config.stopLossFraction !== undefined
        ? { stopLoss: signal === "buy"
          ? price * (1 - this.config.stopLossFraction)
          : price * (1 + this.config.stopLossFraction) }
        : {}),
    };

    const execution = await this.session.submit(intent);
    return {
      signal,
      submitted: execution !== null,
      blocked: execution === null,
      price,
    };
  }
}
