import type { MarketDataProvider, MarketRequest, MarketSeries } from "./market-data.js";
import type { Candle } from "./strategy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const GRANULARITY: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "6h": 21600,
  "1d": 86400,
};

export class CoinbaseExchangeMarketDataProvider implements MarketDataProvider {
  readonly name = "coinbase-exchange-public";

  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly baseUrl = "https://api.exchange.coinbase.com",
  ) {}

  async getCandles(request: MarketRequest): Promise<MarketSeries> {
    const granularity = GRANULARITY[request.timeframe];
    if (!granularity) throw new Error(`Unsupported Coinbase timeframe: ${request.timeframe}`);

    const params = new URLSearchParams({ granularity: String(granularity) });
    if (request.start !== undefined) params.set("start", new Date(request.start * 1000).toISOString());
    if (request.end !== undefined) params.set("end", new Date(request.end * 1000).toISOString());

    const url = `${this.baseUrl}/products/${encodeURIComponent(request.symbol)}/candles?${params}`;
    const response = await this.fetcher(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Coinbase market data request failed: ${response.status}`);

    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) throw new Error("Unexpected Coinbase candles response");

    let candles: Candle[] = payload.map((row) => {
      if (!Array.isArray(row) || row.length < 5) throw new Error("Malformed Coinbase candle");
      return {
        timestamp: Number(row[0]),
        low: Number(row[1]),
        high: Number(row[2]),
        open: Number(row[3]),
        close: Number(row[4]),
      };
    }).sort((a, b) => a.timestamp - b.timestamp);

    if (request.limit !== undefined) candles = candles.slice(-request.limit);
    return { symbol: request.symbol, timeframe: request.timeframe, candles, source: this.name };
  }
}
