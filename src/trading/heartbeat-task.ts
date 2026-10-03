import type { HeartbeatTaskFn } from "../types.js";
import type { MarketRequest } from "./market-data.js";
import type { TraderRuntime } from "./runtime.js";

export function createTraderPaperCycleTask(
  runtime: TraderRuntime,
  requests: readonly MarketRequest[],
): HeartbeatTaskFn {
  if (requests.length === 0) throw new Error("Trader paper cycle requires at least one market");
  return async () => {
    for (const request of requests) await runtime.tick(request);
    return { shouldWake: false };
  };
}
