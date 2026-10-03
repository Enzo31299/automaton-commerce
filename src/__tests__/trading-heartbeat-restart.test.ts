import { describe, expect, it, vi } from "vitest";
import { createTraderPaperCycleTask } from "../trading/heartbeat-task.js";
import { InMemoryMarketDataProvider } from "../trading/market-data.js";

describe("trader heartbeat restart idempotency", () => {
  it("does not process the same candle after a simulated restart", async () => {
    const kv = new Map<string, string>();
    const db = { getKV: (k: string) => kv.get(k), setKV: (k: string, v: string) => { kv.set(k, v); } };
    const market = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1h", [{ timestamp: 100, open: 10, high: 11, low: 9, close: 10 }]],
    ]));
    const tick1 = vi.fn(async () => {});
    const first = createTraderPaperCycleTask({ tick: tick1, snapshot: () => ({} as any) }, [{ symbol: "BTC-USD", timeframe: "1h" }], market, db);
    await first({} as any, {} as any);
    expect(tick1).toHaveBeenCalledTimes(1);

    const tick2 = vi.fn(async () => {});
    const restarted = createTraderPaperCycleTask({ tick: tick2, snapshot: () => ({} as any) }, [{ symbol: "BTC-USD", timeframe: "1h" }], market, db);
    await restarted({} as any, {} as any);
    expect(tick2).not.toHaveBeenCalled();
  });
});
