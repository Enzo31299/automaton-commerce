import type { KeyValueDatabase } from "./sqlite-journal.js";

export class CandleProcessingGuard {
  constructor(private readonly db: KeyValueDatabase) {}

  private key(symbol: string, timeframe: string): string {
    return `trader:last_candle:${symbol}:${timeframe}`;
  }

  shouldProcess(symbol: string, timeframe: string, timestamp: number): boolean {
    if (!Number.isFinite(timestamp)) throw new Error("Candle timestamp must be finite");
    const raw = this.db.getKV(this.key(symbol, timeframe));
    if (raw === undefined) return true;
    const previous = Number(raw);
    if (!Number.isFinite(previous)) throw new Error("Corrupt last-candle state");
    return timestamp > previous;
  }

  markProcessed(symbol: string, timeframe: string, timestamp: number): void {
    if (!Number.isFinite(timestamp)) throw new Error("Candle timestamp must be finite");
    this.db.setKV(this.key(symbol, timeframe), String(timestamp));
  }
}
