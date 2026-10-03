import type { ExecutionAdapter } from "./execution.js";
import type { PortfolioState, TradeIntent, ExecutionResult } from "./types.js";
import { TradingRiskEngine } from "./risk-engine.js";
import type { PaperTradingDecision } from "./paper-trading-gate.js";

export interface PaperPosition {
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
}

export interface PaperSessionState extends PortfolioState {
  initialEquity: number;
  cash: number;
  realizedPnl: number;
  trades: number;
  blockedTrades: number;
  positions: Record<string, PaperPosition>;
}

export class PaperTradingSession {
  private state: PaperSessionState;

  constructor(
    eligibility: PaperTradingDecision,
    initialEquity: number,
    private readonly risk: TradingRiskEngine,
    private readonly execution: ExecutionAdapter,
    restoredState?: PaperSessionState,
  ) {
    if (!eligibility.eligible) throw new Error(`Research gate blocked paper trading: ${eligibility.reasons.join(",")}`);
    if (initialEquity <= 0) throw new Error("Initial equity must be positive");
    this.state = restoredState ? structuredClone(restoredState) : {
      initialEquity, equity: initialEquity, cash: initialEquity, realizedPnl: 0,
      dailyPnl: 0, openPositions: 0, trades: 0, blockedTrades: 0, positions: {},
    };
    if (this.state.initialEquity !== initialEquity) throw new Error("Restored portfolio initial equity mismatch");
  }

  snapshot(): Readonly<PaperSessionState> {
    return { ...this.state, positions: structuredClone(this.state.positions) };
  }

  async submit(intent: TradeIntent): Promise<ExecutionResult | null> {
    const position = this.state.positions[intent.symbol];
    if (intent.side === "sell" && (!position || position.quantity < intent.quantity)) {
      this.state.blockedTrades += 1;
      return null;
    }
    const decision = this.risk.evaluate(intent, this.state);
    if (!decision.allowed) {
      this.state.blockedTrades += 1;
      return null;
    }
    const result = await this.execution.execute(intent);
    this.applyFill(result);
    this.state.trades += 1;
    return result;
  }

  markToMarket(prices: Readonly<Record<string, number>>): void {
    let marketValue = 0;
    for (const position of Object.values(this.state.positions)) {
      const price = prices[position.symbol];
      if (Number.isFinite(price)) marketValue += position.quantity * price;
      else marketValue += position.quantity * position.averageEntryPrice;
    }
    this.state.equity = this.state.cash + marketValue;
  }

  private applyFill(fill: ExecutionResult): void {
    const existing = this.state.positions[fill.symbol];
    if (fill.side === "buy") {
      if (fill.notional > this.state.cash) throw new Error("Insufficient paper cash");
      const previousQuantity = existing?.quantity ?? 0;
      const previousCost = previousQuantity * (existing?.averageEntryPrice ?? 0);
      const quantity = previousQuantity + fill.quantity;
      this.state.cash -= fill.notional;
      this.state.positions[fill.symbol] = {
        symbol: fill.symbol,
        quantity,
        averageEntryPrice: (previousCost + fill.notional) / quantity,
      };
    } else if (existing) {
      const realized = fill.quantity * (fill.fillPrice - existing.averageEntryPrice);
      this.state.cash += fill.notional;
      this.state.realizedPnl += realized;
      this.state.dailyPnl += realized;
      const remaining = existing.quantity - fill.quantity;
      if (remaining <= 1e-12) delete this.state.positions[fill.symbol];
      else this.state.positions[fill.symbol] = { ...existing, quantity: remaining };
    }
    this.state.openPositions = Object.keys(this.state.positions).length;
    this.markToMarket({ [fill.symbol]: fill.fillPrice });
  }

  recordPnl(pnl: number): void {
    if (!Number.isFinite(pnl)) throw new Error("PnL must be finite");
    this.state.cash += pnl;
    this.state.realizedPnl += pnl;
    this.state.dailyPnl += pnl;
    this.state.equity += pnl;
  }

  resetDailyPnl(): void { this.state.dailyPnl = 0; }
}
