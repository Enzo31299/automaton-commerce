import { describe, expect, it } from "vitest";
import { SqliteBackedTradingJournal } from "../trading/sqlite-journal.js";

function database(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set("trader:journal", initial);
  return {
    store,
    db: {
      getKV: (key: string) => store.get(key),
      setKV: (key: string, value: string) => { store.set(key, value); },
    },
  };
}

describe("sqlite-backed trading journal", () => {
  it("rejects unsafe retention and recent limits", async () => {
    const { db } = database();
    expect(() => new SqliteBackedTradingJournal(db, "trader:journal", Number.NaN)).toThrow(/positive safe integer/);
    expect(() => new SqliteBackedTradingJournal(db, "trader:journal", 1.5)).toThrow(/positive safe integer/);

    const journal = new SqliteBackedTradingJournal(db);
    await expect(journal.recent(Number.NaN)).rejects.toThrow(/non-negative safe integer/);
    await expect(journal.recent(1.5)).rejects.toThrow(/non-negative safe integer/);
    await expect(journal.recent(-1)).rejects.toThrow(/non-negative safe integer/);
  });

  it("fails closed on corrupt persisted events", async () => {
    const { db } = database(JSON.stringify([{
      timestamp: 1,
      type: "paper_fill",
      symbol: "BTC-USD",
      details: { fillPrice: Number.NaN },
    }]));
    const journal = new SqliteBackedTradingJournal(db);
    await expect(journal.recent(10)).rejects.toThrow(/Stored trading journal is invalid/);
  });

  it("rejects invalid events before persistence", async () => {
    const { db, store } = database();
    const journal = new SqliteBackedTradingJournal(db);
    await expect(journal.append({
      timestamp: Number.POSITIVE_INFINITY,
      type: "signal",
      symbol: "BTC-USD",
      details: { signal: "buy" },
    })).rejects.toThrow(/Trading event is invalid/);
    expect(store.has("trader:journal")).toBe(false);
  });

  it("persists and returns defensive event copies", async () => {
    const { db } = database();
    const journal = new SqliteBackedTradingJournal(db);
    await journal.append({ timestamp: 1, type: "signal", symbol: " BTC-USD ", strategy: " momentum ", details: { signal: "buy", price: 100 } });
    const recent = await journal.recent(1);
    expect(recent[0].symbol).toBe("BTC-USD");
    expect(recent[0].strategy).toBe("momentum");
    (recent[0].details as Record<string, string | number | boolean>).price = 999;
    expect((await journal.recent(1))[0].details.price).toBe(100);
    expect(await journal.recent(0)).toEqual([]);
  });
});
