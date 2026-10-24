import { describe, expect, it, vi } from "vitest";
import { createTraderPaperCycleTask } from "../trading/heartbeat-task.js";
import { InMemoryMarketDataProvider } from "../trading/market-data.js";

describe("trader heartbeat restart idempotency", () => {
  it("does not process the same candle after a simulated restart and fetches once per processed heartbeat", async () => {
    const kv = new Map<string, string>();
    const db = { getKV: (k: string) => kv.get(k), setKV: (k: string, v: string) => { kv.set(k, v); } };
    const baseMarket = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1h", [{ timestamp: 100, open: 10, high: 11, low: 9, close: 10 }]],
    ]));
    const getCandles = vi.fn(baseMarket.getCandles.bind(baseMarket));
    const market = { name: baseMarket.name, getCandles };

    const tick1 = vi.fn(async (_request, series) => {
      expect(series?.candles.at(-1)?.timestamp).toBe(100);
    });
    const first = createTraderPaperCycleTask({ tick: tick1, snapshot: () => ({} as any) }, [{ symbol: "BTC-USD", timeframe: "1h" }], market, db);
    await first({} as any, {} as any);
    expect(tick1).toHaveBeenCalledTimes(1);
    expect(getCandles).toHaveBeenCalledTimes(1);

    const tick2 = vi.fn(async () => {});
    const restarted = createTraderPaperCycleTask({ tick: tick2, snapshot: () => ({} as any) }, [{ symbol: "BTC-USD", timeframe: "1h" }], market, db);
    await restarted({} as any, {} as any);
    expect(tick2).not.toHaveBeenCalled();
    expect(getCandles).toHaveBeenCalledTimes(2);
  });

  it("does not replay a claimed candle when a tick fails after execution may have started", async () => {
    const kv = new Map<string, string>();
    const db = { getKV: (k: string) => kv.get(k), setKV: (k: string, v: string) => { kv.set(k, v); } };
    const market = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1h", [{ timestamp: 200, open: 10, high: 11, low: 9, close: 10 }]],
    ]));

    const failingTick = vi.fn(async () => {
      throw new Error("simulated interruption after execution started");
    });
    const first = createTraderPaperCycleTask({ tick: failingTick, snapshot: () => ({} as any) }, [{ symbol: "BTC-USD", timeframe: "1h" }], market, db);
    await expect(first({} as any, {} as any)).rejects.toThrow(/simulated interruption/);
    expect(failingTick).toHaveBeenCalledTimes(1);
    expect(kv.get("trader:last_candle:BTC-USD:1h")).toBe("200");

    const restartedTick = vi.fn(async () => {});
    const restarted = createTraderPaperCycleTask({ tick: restartedTick, snapshot: () => ({} as any) }, [{ symbol: "BTC-USD", timeframe: "1h" }], market, db);
    await restarted({} as any, {} as any);
    expect(restartedTick).not.toHaveBeenCalled();
  });
});
