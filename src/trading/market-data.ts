import type { Candle } from "./strategy.js";

export interface MarketRequest {
  symbol: string;
  timeframe: string;
  start?: number;
  end?: number;
  limit?: number;
}

export interface MarketSeries {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  source: string;
}

export interface MarketDataProvider {
  readonly name: string;
  getCandles(request: MarketRequest): Promise<MarketSeries>;
}

export class InMemoryMarketDataProvider implements MarketDataProvider {
  readonly name = "in-memory";

  constructor(private readonly markets: ReadonlyMap<string, readonly Candle[]>) {}

  async getCandles(request: MarketRequest): Promise<MarketSeries> {
    const key = `${request.symbol}:${request.timeframe}`;
    const source = this.markets.get(key);
    if (!source) throw new Error(`Market data not found: ${key}`);

    let candles = source.filter((candle) =>
      (request.start === undefined || candle.timestamp >= request.start) &&
      (request.end === undefined || candle.timestamp <= request.end)
    );
    if (request.limit !== undefined) candles = candles.slice(-request.limit);

    return {
      symbol: request.symbol,
      timeframe: request.timeframe,
      candles: [...candles],
      source: this.name,
    };
  }
}

export function validateMarketSeries(series: MarketSeries): void {
  let previousTimestamp = -Infinity;
  for (const candle of series.candles) {
    if (!Number.isFinite(candle.timestamp) || candle.timestamp <= previousTimestamp) {
      throw new Error("Candles must have strictly increasing timestamps");
    }
    if (![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) {
      throw new Error("Candle prices must be finite");
    }
    if (candle.low > candle.high || candle.high < candle.open || candle.high < candle.close ||
        candle.low > candle.open || candle.low > candle.close) {
      throw new Error("Invalid OHLC candle");
    }
    if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
      throw new Error("Candle prices must be positive");
    }
    previousTimestamp = candle.timestamp;
  }
}
