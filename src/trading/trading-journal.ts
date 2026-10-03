export type TradingEventType =
  | "signal"
  | "risk_block"
  | "paper_fill"
  | "pnl_update";

export interface TradingEvent {
  timestamp: number;
  type: TradingEventType;
  symbol: string;
  strategy?: string;
  details: Record<string, string | number | boolean>;
}

export interface TradingJournal {
  append(event: TradingEvent): Promise<void>;
  recent(limit: number): Promise<readonly TradingEvent[]>;
}

export class InMemoryTradingJournal implements TradingJournal {
  private readonly events: TradingEvent[] = [];

  async append(event: TradingEvent): Promise<void> {
    this.events.push({ ...event, details: { ...event.details } });
  }

  async recent(limit: number): Promise<readonly TradingEvent[]> {
    if (limit < 0) throw new Error("Journal limit must be non-negative");
    return this.events.slice(-limit).map((event) => ({ ...event, details: { ...event.details } }));
  }
}
