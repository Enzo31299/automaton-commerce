import type { KeyValueDatabase } from "./sqlite-journal.js";
import type { PaperSessionState } from "./paper-session.js";

export interface StoredPaperPortfolio {
  version: 1;
  savedAt: string;
  state: PaperSessionState;
}

export class PaperPortfolioStore {
  constructor(
    private readonly db: KeyValueDatabase,
    private readonly key = "trader:paper:portfolio",
  ) {}

  save(state: PaperSessionState, savedAt = new Date().toISOString()): void {
    const payload: StoredPaperPortfolio = { version: 1, savedAt, state };
    this.db.setKV(this.key, JSON.stringify(payload));
  }

  load(): StoredPaperPortfolio | undefined {
    const raw = this.db.getKV(this.key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredPaperPortfolio>;
    if (parsed.version !== 1 || !parsed.state) throw new Error("Unsupported paper portfolio state");
    const s = parsed.state;
    if (![s.initialEquity, s.equity, s.cash, s.realizedPnl, s.dailyPnl, s.openPositions, s.trades, s.blockedTrades].every(Number.isFinite)) {
      throw new Error("Corrupt paper portfolio state");
    }
    if (!s.positions || typeof s.positions !== "object") throw new Error("Corrupt paper positions");
    return parsed as StoredPaperPortfolio;
  }
}
