import type { MarketRequest } from "./market-data.js";
import type { TraderRuntime } from "./runtime.js";
import type { MarketDataProvider } from "./market-data.js";
import { CandleProcessingGuard } from "./candle-processing-guard.js";
import type { KeyValueDatabase } from "./sqlite-journal.js";

export interface TraderPaperCycleResult {
  shouldWake: boolean;
  message?: string;
}

export type TraderPaperCycleTask = () => Promise<TraderPaperCycleResult>;

export function createTraderPaperCycleTask(
  runtime: TraderRuntime,
  requests: readonly MarketRequest[],
  marketData?: MarketDataProvider,
  db?: KeyValueDatabase,
): TraderPaperCycleTask {
  if (requests.length === 0) throw new Error("Trader paper cycle requires at least one market");
  if ((marketData && !db) || (!marketData && db)) throw new Error("marketData and db must be provided together");
  const guard = db ? new CandleProcessingGuard(db) : undefined;
  return async () => {
    let failedMarkets = 0;
    for (const request of requests) {
      if (guard && marketData) {
        let series;
        try {
          // Provider failures are market-local: another market can still be evaluated.
          series = await marketData.getCandles(request);
        } catch {
          failedMarkets += 1;
          continue;
        }

        const latest = series.candles.at(-1);
        if (!latest) continue;

        // Checkpoint reads/writes are process-level safety state. Corruption or
        // persistence failure must stop the cycle rather than being downgraded to
        // a market-local failure, otherwise restart idempotency cannot be trusted.
        if (!guard.shouldProcess(request.symbol, request.timeframe, latest.timestamp)) continue;
        guard.markProcessed(request.symbol, request.timeframe, latest.timestamp);

        try {
          await runtime.tick(request, series);
        } catch {
          // Runtime failures after a successful claim remain market-local. The
          // claimed candle stays fail-closed to avoid duplicate paper execution.
          failedMarkets += 1;
        }
      } else {
        try {
          await runtime.tick(request);
        } catch {
          failedMarkets += 1;
        }
      }
    }
    return {
      shouldWake: failedMarkets > 0,
      ...(failedMarkets > 0 ? { message: `Trader paper cycle failed for ${failedMarkets} market(s)` } : {}),
    };
  };
}
