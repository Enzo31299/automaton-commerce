import { describe, expect, it, vi } from "vitest";
import { createTraderPaperCycleTask } from "../trading/heartbeat-task.js";

describe("trader paper heartbeat task", () => {
  it("ticks every configured market and never requests an agent wake by default", async () => {
    const tick = vi.fn(async () => {});
    const task = createTraderPaperCycleTask({ tick, snapshot: () => ({} as any) }, [
      { symbol: "BTC-USD", timeframe: "1d" },
      { symbol: "ETH-USD", timeframe: "1d" },
    ]);
    const result = await task({} as any, {} as any);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(result.shouldWake).toBe(false);
  });
});
