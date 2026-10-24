export interface PaperServiceCycleResult {
  shouldWake: boolean;
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
): PaperServiceLoop {
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 10_000) {
    throw new Error("Paper service poll interval must be a safe integer >= 10000");
  }

  return {
    async run(signal?: AbortSignal): Promise<void> {
      while (!signal?.aborted) {
        const result = await task();
        if (signal?.aborted) return;
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
