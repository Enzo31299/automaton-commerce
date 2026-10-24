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
    const result = await first({} as any, {} as any);
    expect(result.shouldWake).toBe(true);
    expect(result.message).toMatch(/1 market/);
    expect(failingTick).toHaveBeenCalledTimes(1);
    expect(kv.get("trader:last_candle:BTC-USD:1h")).toBe("200");

    const restartedTick = vi.fn(async () => {});
    const restarted = createTraderPaperCycleTask({ tick: restartedTick, snapshot: () => ({} as any) }, [{ symbol: "BTC-USD", timeframe: "1h" }], market, db);
    await restarted({} as any, {} as any);
    expect(restartedTick).not.toHaveBeenCalled();
  });

  it("continues with other paper markets when one runtime fails", async () => {
    const kv = new Map<string, string>();
    const db = { getKV: (k: string) => kv.get(k), setKV: (k: string, v: string) => { kv.set(k, v); } };
    const market = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1h", [{ timestamp: 300, open: 10, high: 11, low: 9, close: 10 }]],
      ["ETH-USD:1h", [{ timestamp: 300, open: 20, high: 21, low: 19, close: 20 }]],
    ]));
    const tick = vi.fn(async (request) => {
      if (request.symbol === "BTC-USD") throw new Error("simulated BTC failure");
    });
    const task = createTraderPaperCycleTask(
      { tick, snapshot: () => ({} as any) },
      [{ symbol: "BTC-USD", timeframe: "1h" }, { symbol: "ETH-USD", timeframe: "1h" }],
      market,
      db,
    );

    const result = await task({} as any, {} as any);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(tick.mock.calls.map(([request]) => request.symbol)).toEqual(["BTC-USD", "ETH-USD"]);
    expect(result.shouldWake).toBe(true);
    expect(kv.get("trader:last_candle:BTC-USD:1h")).toBe("300");
    expect(kv.get("trader:last_candle:ETH-USD:1h")).toBe("300");
  });

  it("continues with another market when a provider request fails before checkpointing", async () => {
    const kv = new Map<string, string>();
    const db = { getKV: (k: string) => kv.get(k), setKV: (k: string, v: string) => { kv.set(k, v); } };
    const baseMarket = new InMemoryMarketDataProvider(new Map([
      ["ETH-USD:1h", [{ timestamp: 400, open: 20, high: 21, low: 19, close: 20 }]],
    ]));
    const market = {
      name: "mixed-provider",
      getCandles: vi.fn(async (request) => {
        if (request.symbol === "BTC-USD") throw new Error("provider unavailable");
        return baseMarket.getCandles(request);
      }),
    };
    const tick = vi.fn(async () => {});
    const task = createTraderPaperCycleTask(
      { tick, snapshot: () => ({} as any) },
      [{ symbol: "BTC-USD", timeframe: "1h" }, { symbol: "ETH-USD", timeframe: "1h" }],
      market,
      db,
    );

    const result = await task({} as any, {} as any);
    expect(result.shouldWake).toBe(true);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(kv.has("trader:last_candle:BTC-USD:1h")).toBe(false);
    expect(kv.get("trader:last_candle:ETH-USD:1h")).toBe("400");
  });

  it("fails the whole cycle on corrupt checkpoint state", async () => {
    const kv = new Map<string, string>([["trader:last_candle:BTC-USD:1h", "corrupt"]]);
    const db = { getKV: (k: string) => kv.get(k), setKV: (k: string, v: string) => { kv.set(k, v); } };
    const market = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1h", [{ timestamp: 500, open: 10, high: 11, low: 9, close: 10 }]],
    ]));
    const tick = vi.fn(async () => {});
    const task = createTraderPaperCycleTask({ tick, snapshot: () => ({} as any) }, [{ symbol: "BTC-USD", timeframe: "1h" }], market, db);

    await expect(task({} as any, {} as any)).rejects.toThrow(/Corrupt last-candle state/);
    expect(tick).not.toHaveBeenCalled();
  });

  it("fails the whole cycle when a candle checkpoint cannot be persisted", async () => {
    const kv = new Map<string, string>();
    const db = {
      getKV: (k: string) => kv.get(k),
      setKV: (k: string, v: string) => {
        if (k.startsWith("trader:last_candle:")) throw new Error("checkpoint persistence failed");
        kv.set(k, v);
      },
    };
    const market = new InMemoryMarketDataProvider(new Map([
      ["BTC-USD:1h", [{ timestamp: 600, open: 10, high: 11, low: 9, close: 10 }]],
    ]));
    const tick = vi.fn(async () => {});
    const task = createTraderPaperCycleTask({ tick, snapshot: () => ({} as any) }, [{ symbol: "BTC-USD", timeframe: "1h" }], market, db);

    await expect(task({} as any, {} as any)).rejects.toThrow(/checkpoint persistence failed/);
    expect(tick).not.toHaveBeenCalled();
  });
});
