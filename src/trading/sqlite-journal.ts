import type { TradingEvent, TradingEventType, TradingJournal } from "./trading-journal.js";

export interface KeyValueDatabase {
  getKV(key: string): string | undefined;
  setKV(key: string, value: string): void;
}

const EVENT_TYPES = new Set<TradingEventType>(["signal", "risk_block", "paper_fill", "pnl_update"]);

function isDetailValue(value: unknown): value is string | number | boolean {
  return typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}

function isTradingEvent(value: unknown): value is TradingEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (!Number.isFinite(event.timestamp)) return false;
  if (typeof event.type !== "string" || !EVENT_TYPES.has(event.type as TradingEventType)) return false;
  if (typeof event.symbol !== "string" || event.symbol.trim().length === 0) return false;
  if (event.strategy !== undefined && (typeof event.strategy !== "string" || event.strategy.trim().length === 0)) return false;
  if (!event.details || typeof event.details !== "object" || Array.isArray(event.details)) return false;
  return Object.values(event.details as Record<string, unknown>).every(isDetailValue);
}

function validateLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Journal limit must be a non-negative safe integer");
}

export class SqliteBackedTradingJournal implements TradingJournal {
  constructor(
    private readonly db: KeyValueDatabase,
    private readonly key = "trader:journal",
    private readonly maxEvents = 1000,
  ) {
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) throw new Error("maxEvents must be a positive safe integer");
  }

  async append(event: TradingEvent): Promise<void> {
    if (!isTradingEvent(event)) throw new Error("Trading event is invalid");
    const events = this.read();
    events.push({ ...event, symbol: event.symbol.trim(), strategy: event.strategy?.trim(), details: { ...event.details } });
    this.db.setKV(this.key, JSON.stringify(events.slice(-this.maxEvents)));
  }

  async recent(limit: number): Promise<readonly TradingEvent[]> {
    validateLimit(limit);
    if (limit === 0) return [];
    return this.read().slice(-limit).map((event) => ({ ...event, details: { ...event.details } }));
  }

  private read(): TradingEvent[] {
    const raw = this.db.getKV(this.key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(isTradingEvent)) throw new Error("Stored trading journal is invalid");
    return parsed.map((event) => ({ ...event, details: { ...event.details } }));
  }
}
