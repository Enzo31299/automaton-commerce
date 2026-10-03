import { describe, expect, it } from "vitest";
import { SqliteBackedTradingJournal } from "../trading/sqlite-journal.js";
import { runTraderHeartbeat } from "../trading/trader-heartbeat.js";

describe("trader persistence and heartbeat", () => {
  it("persists bounded trading events through Automaton KV semantics", async () => {
    const store = new Map<string, string>();
    const db = { getKV: (key: string) => store.get(key), setKV: (key: string, value: string) => { store.set(key, value); } };
    const journal = new SqliteBackedTradingJournal(db, "trader:test", 2);
    for (let i = 1; i <= 3; i++) await journal.append({ timestamp: i, type: "signal", symbol: "BTC-USD", details: { i } });
    expect((await journal.recent(10)).map((x) => x.timestamp)).toEqual([2, 3]);
  });

  it("records a heartbeat result and requests wake on a risk block", async () => {
    const events: any[] = [];
    const journal = { append: async (event: any) => { events.push(event); }, recent: async () => events };
    const loop = { tick: async () => ({ signal: "buy" as const, submitted: false, blocked: true, price: 100 }) };
    const result = await runTraderHeartbeat(loop as any, journal, { symbol: "BTC-USD", timeframe: "1d" }, "momentum", 42);
    expect(result.shouldWake).toBe(true);
    expect(events.map((x) => x.type)).toEqual(["signal", "risk_block"]);
  });
});
