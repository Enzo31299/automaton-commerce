import { describe, expect, it } from "vitest";
import { inspectPaperTraderHealth } from "../trading/vps-health.js";

class MemoryDb {
  private readonly values = new Map<string, string>();
  getKV(key: string): string | undefined { return this.values.get(key); }
  setKV(key: string, value: unknown): void { this.values.set(key, String(value)); }
}

describe("VPS paper trader health", () => {
  it("reports healthy only for a recent persisted tick", () => {
    const db = new MemoryDb();
    const now = Date.parse("2026-10-24T12:00:00.000Z");
    db.setKV("trader:last_tick", "2026-10-24T11:30:00.000Z");
    expect(inspectPaperTraderHealth(db, now, 3_600_000)).toEqual({
      healthy: true,
      mode: "paper",
      lastTick: "2026-10-24T11:30:00.000Z",
      ageMs: 1_800_000,
      reasons: [],
    });
  });

  it("fails closed when the trader has never completed a durable tick", () => {
    expect(inspectPaperTraderHealth(new MemoryDb(), Date.now())).toEqual({
      healthy: false,
      mode: "paper",
      reasons: ["missing_last_tick"],
    });
  });

  it("rejects stale, corrupt, and future timestamps", () => {
    const now = Date.parse("2026-10-24T12:00:00.000Z");
    const db = new MemoryDb();
    db.setKV("trader:last_tick", "2026-10-24T09:00:00.000Z");
    expect(inspectPaperTraderHealth(db, now, 3_600_000).reasons).toEqual(["stale_last_tick"]);
    db.setKV("trader:last_tick", "corrupt");
    expect(inspectPaperTraderHealth(db, now).reasons).toEqual(["invalid_last_tick"]);
    db.setKV("trader:last_tick", "2026-10-24T13:00:00.000Z");
    expect(inspectPaperTraderHealth(db, now).reasons).toEqual(["last_tick_in_future"]);
  });

  it("fails closed on invalid health configuration", () => {
    expect(inspectPaperTraderHealth(new MemoryDb(), Number.NaN).reasons).toEqual(["invalid_health_configuration"]);
    expect(inspectPaperTraderHealth(new MemoryDb(), Date.now(), 0).reasons).toEqual(["invalid_health_configuration"]);
  });
});
