export interface PaperServiceCycleResult {
  shouldWake: boolean;
  failedMarkets?: number;
  totalMarkets?: number;
  message?: string;
}

export type PaperServiceCycleTask = () => Promise<PaperServiceCycleResult>;

export interface PaperServiceLoop {
  run(signal?: AbortSignal): Promise<void>;
}

export function createPaperServiceLoop(
  task: PaperServiceCycleTask,
  pollIntervalMs: number,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void> = defaultSleep,
  maxConsecutiveTotalFailures = 6,
): PaperServiceLoop {
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 10_000) {
    throw new Error("Paper service poll interval must be a safe integer >= 10000");
  }
  if (!Number.isSafeInteger(maxConsecutiveTotalFailures) || maxConsecutiveTotalFailures < 1) {
    throw new Error("Paper service failure threshold must be a positive safe integer");
  }

  return {
    async run(signal?: AbortSignal): Promise<void> {
      let consecutiveTotalFailures = 0;
      while (!signal?.aborted) {
        const result = await task();
        if (signal?.aborted) return;

        const hasCounts = Number.isSafeInteger(result.failedMarkets) && Number.isSafeInteger(result.totalMarkets)
          && (result.totalMarkets as number) > 0;
        const totalFailure = hasCounts && result.failedMarkets === result.totalMarkets;
        consecutiveTotalFailures = totalFailure ? consecutiveTotalFailures + 1 : 0;
        if (consecutiveTotalFailures >= maxConsecutiveTotalFailures) {
          throw new Error(`Paper service failed all markets for ${consecutiveTotalFailures} consecutive cycles`);
        }

        // A market-local failure asks for an earlier retry, but never spins hot.
        const delay = result.shouldWake ? Math.min(pollIntervalMs, 10_000) : pollIntervalMs;
        await sleep(delay, signal);
      }
    },
  };
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
