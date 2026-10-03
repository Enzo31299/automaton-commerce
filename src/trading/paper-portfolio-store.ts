import type { KeyValueDatabase } from "./sqlite-journal.js";
import type { PaperPosition, PaperSessionState } from "./paper-session.js";

export interface StoredPaperPortfolio {
  version: 1;
  savedAt: string;
  state: PaperSessionState;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPaperPosition(value: unknown, symbol: string): value is PaperPosition {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<PaperPosition>;
  return p.symbol === symbol &&
    typeof p.quantity === "number" && Number.isFinite(p.quantity) && p.quantity > 0 &&
    typeof p.averageEntryPrice === "number" && Number.isFinite(p.averageEntryPrice) && p.averageEntryPrice > 0;
}

function validateState(state: unknown): asserts state is PaperSessionState {
  if (!state || typeof state !== "object") throw new Error("Corrupt paper portfolio state");
  const s = state as Partial<PaperSessionState>;
  if (typeof s.initialEquity !== "number" || !Number.isFinite(s.initialEquity) || s.initialEquity <= 0 ||
      typeof s.equity !== "number" || !Number.isFinite(s.equity) ||
      !isFiniteNonNegative(s.cash) ||
      typeof s.realizedPnl !== "number" || !Number.isFinite(s.realizedPnl) ||
      typeof s.dailyPnl !== "number" || !Number.isFinite(s.dailyPnl) ||
      !Number.isInteger(s.openPositions) || !isFiniteNonNegative(s.openPositions) ||
      !Number.isInteger(s.trades) || !isFiniteNonNegative(s.trades) ||
      !Number.isInteger(s.blockedTrades) || !isFiniteNonNegative(s.blockedTrades)) {
    throw new Error("Corrupt paper portfolio state");
  }
  if (!s.positions || typeof s.positions !== "object" || Array.isArray(s.positions)) {
    throw new Error("Corrupt paper positions");
  }
  const entries = Object.entries(s.positions);
  if (entries.length !== s.openPositions || entries.some(([symbol, position]) => !isPaperPosition(position, symbol))) {
    throw new Error("Inconsistent paper positions");
  }
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
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Unsupported paper portfolio state");
    const payload = parsed as { version?: unknown; savedAt?: unknown; state?: unknown };
    if (payload.version !== 1 || typeof payload.savedAt !== "string" || !Number.isFinite(Date.parse(payload.savedAt))) {
      throw new Error("Unsupported paper portfolio state");
    }
    validateState(payload.state);
    return { version: 1, savedAt: payload.savedAt, state: payload.state };
  }
}
