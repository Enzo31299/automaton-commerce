import type { ExecutionAdapter } from "./execution.js";
import type { PortfolioState, TradeIntent, ExecutionResult } from "./types.js";
import { TradingRiskEngine } from "./risk-engine.js";
import type { PaperTradingDecision } from "./paper-trading-gate.js";

export interface PaperSessionState extends PortfolioState {
  initialEquity: number;
  trades: number;
  blockedTrades: number;
}

export class PaperTradingSession {
  private state: PaperSessionState;

  constructor(
    eligibility: PaperTradingDecision,
    initialEquity: number,
    private readonly risk: TradingRiskEngine,
    private readonly execution: ExecutionAdapter,
  ) {
    if (!eligibility.eligible) throw new Error(`Research gate blocked paper trading: ${eligibility.reasons.join(",")}`);
    if (initialEquity <= 0) throw new Error("Initial equity must be positive");
    this.state = { initialEquity, equity: initialEquity, dailyPnl: 0, openPositions: 0, trades: 0, blockedTrades: 0 };
  }

  snapshot(): Readonly<PaperSessionState> {
    return { ...this.state };
  }

  async submit(intent: TradeIntent): Promise<ExecutionResult | null> {
    const decision = this.risk.evaluate(intent, this.state);
    if (!decision.allowed) {
      this.state.blockedTrades += 1;
      return null;
    }
    const result = await this.execution.execute(intent);
    this.state.trades += 1;
    return result;
  }

  recordPnl(pnl: number): void {
    if (!Number.isFinite(pnl)) throw new Error("PnL must be finite");
    this.state.equity += pnl;
    this.state.dailyPnl += pnl;
  }

  resetDailyPnl(): void {
    this.state.dailyPnl = 0;
  }
}
