import type { MarketDataProvider, MarketRequest, MarketSeries } from "./market-data.js";
import type { Candle } from "./strategy.js";

export interface HistoricalDataset {
  symbol: string;
  timeframe: string;
  source: string;
  csv: string;
}

export function parseOhlcCsv(csv: string): Candle[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const required = ["timestamp", "open", "high", "low", "close"];
  const indexes = Object.fromEntries(required.map((name) => [name, headers.indexOf(name)]));
  if (required.some((name) => indexes[name] < 0)) {
    throw new Error("CSV must contain timestamp,open,high,low,close");
  }

  return lines.slice(1).filter(Boolean).map((line, row) => {
    const values = line.split(",").map((value) => value.trim());
    const candle: Candle = {
      timestamp: Number(values[indexes.timestamp]),
      open: Number(values[indexes.open]),
      high: Number(values[indexes.high]),
      low: Number(values[indexes.low]),
      close: Number(values[indexes.close]),
    };
    if (![candle.timestamp, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) {
      throw new Error(`Invalid numeric OHLC value at row ${row + 2}`);
    }
    return candle;
  });
}

export class HistoricalCsvProvider implements MarketDataProvider {
  readonly name = "historical-csv";

  constructor(private readonly datasets: readonly HistoricalDataset[]) {}

  async getCandles(request: MarketRequest): Promise<MarketSeries> {
    const dataset = this.datasets.find(
      (item) => item.symbol === request.symbol && item.timeframe === request.timeframe,
    );
    if (!dataset) throw new Error(`Historical dataset not found: ${request.symbol}:${request.timeframe}`);

    let candles = parseOhlcCsv(dataset.csv).filter((candle) =>
      (request.start === undefined || candle.timestamp >= request.start) &&
      (request.end === undefined || candle.timestamp <= request.end)
    );
    if (request.limit !== undefined) candles = candles.slice(-request.limit);
    return { symbol: dataset.symbol, timeframe: dataset.timeframe, candles, source: dataset.source };
  }
}
