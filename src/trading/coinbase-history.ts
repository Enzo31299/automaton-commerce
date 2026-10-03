import type { Candle } from "./strategy.js";
import type { FetchLike } from "./coinbase-market-data.js";

const GRANULARITY_SECONDS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400,
};

export interface HistoricalDownloadRequest {
  symbol: string;
  timeframe: string;
  start: number;
  end: number;
}

export async function downloadCoinbaseHistory(
  request: HistoricalDownloadRequest,
  fetchFn: FetchLike = fetch,
  baseUrl = "https://api.exchange.coinbase.com",
): Promise<Candle[]> {
  const seconds = GRANULARITY_SECONDS[request.timeframe];
  if (!seconds) throw new Error(`Unsupported timeframe: ${request.timeframe}`);
  if (request.end <= request.start) throw new Error("Historical end must be after start");

  // Coinbase Exchange candles are capped per request; use conservative 300-candle chunks.
  const chunkSeconds = seconds * 300;
  const byTimestamp = new Map<number, Candle>();

  for (let start = request.start; start < request.end; start += chunkSeconds) {
    const end = Math.min(request.end, start + chunkSeconds);
    const url = new URL(`${baseUrl}/products/${encodeURIComponent(request.symbol)}/candles`);
    url.searchParams.set("granularity", String(seconds));
    url.searchParams.set("start", new Date(start * 1000).toISOString());
    url.searchParams.set("end", new Date(end * 1000).toISOString());
    const response = await fetchFn(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Coinbase historical request failed: ${response.status}`);
    const rows = await response.json() as number[][];
    for (const row of rows) {
      const [timestamp, low, high, open, close] = row;
      if ([timestamp, low, high, open, close].every(Number.isFinite)) {
        byTimestamp.set(timestamp, { timestamp, low, high, open, close });
      }
    }
  }

  return [...byTimestamp.values()]
    .filter((c) => c.timestamp >= request.start && c.timestamp <= request.end)
    .sort((a, b) => a.timestamp - b.timestamp);
}
