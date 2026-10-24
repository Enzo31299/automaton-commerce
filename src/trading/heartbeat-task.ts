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
    let failedMarkets = 0;
    for (const request of requests) {
      try {
        if (guard && marketData) {
          // Fetch once for this heartbeat. The same series is used both to identify
          // the latest candle and to evaluate the strategy, avoiding a second API call.
          const series = await marketData.getCandles(request);
          const latest = series.candles.at(-1);
          if (!latest || !guard.shouldProcess(request.symbol, request.timeframe, latest.timestamp)) continue;

          // Claim the candle before handing it to the runtime. If the process crashes
          // after a paper fill but before the heartbeat returns, a restart must not
          // replay the same candle and mutate simulated capital twice. This is
          // intentionally fail-closed: an interrupted candle may be skipped rather
          // than risk duplicate execution.
          guard.markProcessed(request.symbol, request.timeframe, latest.timestamp);
          await runtime.tick(request, series);
        } else {
          await runtime.tick(request);
        }
      } catch {
        // A single provider/runtime failure must not prevent the remaining paper
        // markets from being evaluated. The failed market stays fail-closed when
        // its candle was already claimed, while the heartbeat asks the host to wake.
        failedMarkets += 1;
      }
    }
    return {
      shouldWake: failedMarkets > 0,
      ...(failedMarkets > 0 ? { message: `Trader paper cycle failed for ${failedMarkets} market(s)` } : {}),
    };
  };
}
