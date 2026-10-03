import type { KeyValueDatabase } from "./sqlite-journal.js";
import type { TradingEvent } from "./trading-journal.js";

export interface TradingMemorySummary {
  observations: number;
  paperFills: number;
  riskBlocks: number;
  pnlUpdates: number;
  lastUpdatedAt: number;
}

export class TradingMemory {
  constructor(
    private readonly db: KeyValueDatabase,
    private readonly key = "trader:memory:summary",
  ) {}

  observe(events: readonly TradingEvent[], now = Date.now()): TradingMemorySummary {
    const summary: TradingMemorySummary = {
      observations: events.length,
      paperFills: events.filter((x) => x.type === "paper_fill").length,
      riskBlocks: events.filter((x) => x.type === "risk_block").length,
      pnlUpdates: events.filter((x) => x.type === "pnl_update").length,
      lastUpdatedAt: now,
    };
    this.db.setKV(this.key, JSON.stringify(summary));
    return summary;
  }

  read(): TradingMemorySummary | undefined {
    const raw = this.db.getKV(this.key);
    return raw ? JSON.parse(raw) as TradingMemorySummary : undefined;
  }
}
