import type { Candle } from "./strategy.js";
import type { FetchLike } from "./coinbase-market-data.js";

const GRANULARITY_SECONDS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400,
};
const MAX_ATTEMPTS = 3;

export interface HistoricalDownloadRequest {
  symbol: string;
  timeframe: string;
  start: number;
  end: number;
}

type Sleep = (ms: number) => Promise<void>;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateRequest(request: HistoricalDownloadRequest): void {
  if (!request.symbol.trim()) throw new Error("Historical symbol is required");
  if (!Number.isSafeInteger(request.start) || request.start < 0 || !Number.isSafeInteger(request.end) || request.end < 1) {
    throw new Error("Historical start and end must be non-negative Unix epoch seconds");
  }
  if (request.end <= request.start) throw new Error("Historical end must be after start");
}

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchChunk(url: string, fetchFn: FetchLike, sleep: Sleep): Promise<number[][]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchFn(url, { headers: { Accept: "application/json" } });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      await sleep(250 * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) return await response.json() as number[][];
    if (!retryableStatus(response.status)) {
      throw new Error(`Coinbase historical request failed: ${response.status}`);
    }
    if (attempt === MAX_ATTEMPTS) {
      throw new Error(`Coinbase historical request failed: ${response.status}`);
    }
    await sleep(250 * 2 ** (attempt - 1));
  }
  throw new Error("Coinbase historical request failed");
}

export async function downloadCoinbaseHistory(
  request: HistoricalDownloadRequest,
  fetchFn: FetchLike = fetch,
  baseUrl = "https://api.exchange.coinbase.com",
  sleep: Sleep = defaultSleep,
): Promise<Candle[]> {
  const seconds = GRANULARITY_SECONDS[request.timeframe];
  if (!seconds) throw new Error(`Unsupported timeframe: ${request.timeframe}`);
  validateRequest(request);

  // Coinbase Exchange candles are capped per request; use conservative 300-candle chunks.
  const chunkSeconds = seconds * 300;
  const byTimestamp = new Map<number, Candle>();

  for (let start = request.start; start < request.end; start += chunkSeconds) {
    const end = Math.min(request.end, start + chunkSeconds);
    const url = new URL(`${baseUrl}/products/${encodeURIComponent(request.symbol)}/candles`);
    url.searchParams.set("granularity", String(seconds));
    url.searchParams.set("start", new Date(start * 1000).toISOString());
    url.searchParams.set("end", new Date(end * 1000).toISOString());
    const rows = await fetchChunk(url.toString(), fetchFn, sleep);
    if (!Array.isArray(rows)) throw new Error("Coinbase historical response is invalid");
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
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
