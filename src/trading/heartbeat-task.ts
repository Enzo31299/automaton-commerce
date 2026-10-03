import type { HeartbeatTaskFn } from "../types.js";
import type { MarketRequest } from "./market-data.js";
import type { TraderRuntime } from "./runtime.js";
import type { MarketDataProvider } from "./market-data.js";
import { CandleProcessingGuard } from "./candle-processing-guard.js";
import type { KeyValueDatabase } from "./sqlite-journal.js";

export function createTraderPaperCycleTask(
  runtime: TraderRuntime,
  requests: readonly MarketRequest[],
  marketData?: MarketDataProvider,
  db?: KeyValueDatabase,
): HeartbeatTaskFn {
  if (requests.length === 0) throw new Error("Trader paper cycle requires at least one market");
  if ((marketData && !db) || (!marketData && db)) throw new Error("marketData and db must be provided together");
  const guard = db ? new CandleProcessingGuard(db) : undefined;
  return async () => {
    for (const request of requests) {
      if (guard && marketData) {
        const series = await marketData.getCandles({ ...request, limit: 1 });
        const latest = series.candles.at(-1);
        if (!latest || !guard.shouldProcess(request.symbol, request.timeframe, latest.timestamp)) continue;
        await runtime.tick(request);
        guard.markProcessed(request.symbol, request.timeframe, latest.timestamp);
      } else {
        await runtime.tick(request);
      }
    }
    return { shouldWake: false };
  };
}
