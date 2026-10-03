import type { TradingEvent, TradingJournal } from "./trading-journal.js";

export interface KeyValueDatabase {
  getKV(key: string): string | undefined;
  setKV(key: string, value: string): void;
}

export class SqliteBackedTradingJournal implements TradingJournal {
  constructor(
    private readonly db: KeyValueDatabase,
    private readonly key = "trader:journal",
    private readonly maxEvents = 1000,
  ) {
    if (maxEvents < 1) throw new Error("maxEvents must be positive");
  }

  async append(event: TradingEvent): Promise<void> {
    const events = this.read();
    events.push({ ...event, details: { ...event.details } });
    this.db.setKV(this.key, JSON.stringify(events.slice(-this.maxEvents)));
  }

  async recent(limit: number): Promise<readonly TradingEvent[]> {
    if (limit < 0) throw new Error("Journal limit must be non-negative");
    return this.read().slice(-limit);
  }

  private read(): TradingEvent[] {
    const raw = this.db.getKV(this.key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Stored trading journal is invalid");
    return parsed as TradingEvent[];
  }
}
