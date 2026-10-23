import type { MarketDataProvider, MarketRequest, MarketSeries } from "./market-data.js";
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
    if (!Number.isFinite(config.quantity) || config.quantity <= 0) {
      throw new Error("Paper loop quantity must be a finite positive number");
    }
    if (config.stopLossFraction !== undefined &&
        (!Number.isFinite(config.stopLossFraction) || config.stopLossFraction <= 0 || config.stopLossFraction >= 1)) {
      throw new Error("Paper loop stop loss fraction must be between 0 and 1");
    }
  }

  async tick(request: MarketRequest, prefetchedSeries?: MarketSeries): Promise<PaperLoopResult> {
    const series = prefetchedSeries ?? await this.marketData.getCandles(request);
    if (series.symbol !== request.symbol || series.timeframe !== request.timeframe) {
      throw new Error("Prefetched market series does not match request");
    }
    if (series.candles.length === 0) return { signal: "hold", submitted: false, blocked: false };

    const signal = this.strategy.signal(series.candles);
    if (signal === "hold") return { signal, submitted: false, blocked: false };

    const position = this.session.snapshot().positions[request.symbol];
    if ((signal === "buy" && position) || (signal === "sell" && !position)) {
      return { signal: "hold", submitted: false, blocked: false };
    }

    const price = series.candles.at(-1)!.close;
    if (!Number.isFinite(price) || price <= 0) {
      return { signal, submitted: false, blocked: true, price };
    }
    const quantity = signal === "sell" ? position!.quantity : this.config.quantity;
    const intent: TradeIntent = {
      symbol: request.symbol,
      side: signal,
      quantity,
      price,
      ...(this.config.stopLossFraction !== undefined
        ? { stopLossPrice: signal === "buy"
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
