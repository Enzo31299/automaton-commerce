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
    if (!Number.isFinite(initialEquity) || initialEquity <= 0) throw new Error("Initial equity must be finite and positive");
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
    const estimate = this.execution.estimate?.(intent);
    const effectivePrice = estimate?.fillPrice ?? intent.price;
    const existingNotional = position ? position.quantity * effectivePrice : 0;
    const opensNewPosition = intent.side === "buy" && !position;
    const decision = this.risk.evaluate(intent, this.state, {
      existingNotional,
      opensNewPosition,
      estimatedFillPrice: estimate?.fillPrice,
      estimatedFee: estimate?.fee,
    });
    if (!decision.allowed) {
      this.state.blockedTrades += 1;
      return null;
    }
    if (intent.side === "buy" && estimate && estimate.notional + estimate.fee > this.state.cash) {
      this.state.blockedTrades += 1;
      return null;
    }
    const result = await this.execution.execute(intent);
    if (!this.isValidFill(intent, result)) {
      this.state.blockedTrades += 1;
      return null;
    }
    if (result.side === "buy" && result.notional + result.fee > this.state.cash) {
      this.state.blockedTrades += 1;
      return null;
    }
    this.applyFill(result);
    this.state.trades += 1;
    return result;
  }

  markToMarket(prices: Readonly<Record<string, number>>): void {
    let marketValue = 0;
    for (const position of Object.values(this.state.positions)) {
      const price = prices[position.symbol];
      if (Number.isFinite(price) && price > 0) marketValue += position.quantity * price;
      else marketValue += position.quantity * position.averageEntryPrice;
    }
    this.state.equity = this.state.cash + marketValue;
  }

  private isValidFill(intent: TradeIntent, fill: ExecutionResult): boolean {
    if (fill.mode !== "paper" || fill.symbol !== intent.symbol || fill.side !== intent.side) return false;
    if (!Number.isFinite(fill.quantity) || fill.quantity <= 0 || fill.quantity > intent.quantity) return false;
    if (!Number.isFinite(fill.fillPrice) || fill.fillPrice <= 0) return false;
    if (!Number.isFinite(fill.notional) || fill.notional < 0) return false;
    if (!Number.isFinite(fill.fee) || fill.fee < 0) return false;
    if (!Number.isFinite(fill.timestamp)) return false;
    const expectedNotional = fill.quantity * fill.fillPrice;
    const tolerance = Math.max(1e-9, Math.abs(expectedNotional) * 1e-9);
    return Math.abs(fill.notional - expectedNotional) <= tolerance;
  }

  private applyFill(fill: ExecutionResult): void {
    const existing = this.state.positions[fill.symbol];
    if (fill.side === "buy") {
      const totalCost = fill.notional + fill.fee;
      const previousQuantity = existing?.quantity ?? 0;
      const previousCost = previousQuantity * (existing?.averageEntryPrice ?? 0);
      const quantity = previousQuantity + fill.quantity;
      this.state.cash -= totalCost;
      // The entry cost basis already includes the buy fee. Do not also book that
      // fee as realized PnL here, otherwise it is counted a second time on exit.
      this.state.positions[fill.symbol] = {
        symbol: fill.symbol,
        quantity,
        averageEntryPrice: (previousCost + totalCost) / quantity,
      };
    } else if (existing) {
      const realizedBeforeFee = fill.quantity * (fill.fillPrice - existing.averageEntryPrice);
      const realized = realizedBeforeFee - fill.fee;
      this.state.cash += fill.notional - fill.fee;
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
    const nextCash = this.state.cash + pnl;
    const nextEquity = this.state.equity + pnl;
    if (nextCash < 0 || nextEquity < 0) throw new Error("PnL cannot make paper capital negative");
    this.state.cash = nextCash;
    this.state.realizedPnl += pnl;
    this.state.dailyPnl += pnl;
    this.state.equity = nextEquity;
  }

  resetDailyPnl(): void { this.state.dailyPnl = 0; }
}
