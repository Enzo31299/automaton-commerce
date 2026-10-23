import type { PortfolioState, RiskDecision, RiskLimits, TradeIntent } from "./types.js";

export interface PositionRiskContext {
  existingNotional?: number;
  opensNewPosition?: boolean;
  estimatedFillPrice?: number;
  estimatedFee?: number;
}

export class TradingRiskEngine {
  constructor(private readonly limits: RiskLimits) {}

  evaluate(intent: TradeIntent, portfolio: PortfolioState, context: PositionRiskContext = {}): RiskDecision {
    if (!Number.isFinite(intent.quantity) || intent.quantity <= 0) {
      return { allowed: false, reason: "invalid_quantity" };
    }
    if (!Number.isFinite(intent.price) || intent.price <= 0) {
      return { allowed: false, reason: "invalid_price" };
    }
    if (!this.limits.allowedSymbols.includes(intent.symbol)) {
      return { allowed: false, reason: "symbol_not_allowed" };
    }
    if (intent.side === "buy" && context.opensNewPosition !== false && portfolio.openPositions >= this.limits.maxOpenPositions) {
      return { allowed: false, reason: "max_open_positions" };
    }
    if (portfolio.dailyPnl <= -Math.abs(this.limits.maxDailyLoss)) {
      return { allowed: false, reason: "daily_loss_limit" };
    }

    const effectivePrice = context.estimatedFillPrice ?? intent.price;
    if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) {
      return { allowed: false, reason: "invalid_price" };
    }
    const estimatedFee = context.estimatedFee ?? 0;
    if (!Number.isFinite(estimatedFee) || estimatedFee < 0) {
      return { allowed: false, reason: "invalid_execution_cost" };
    }

    const notional = intent.quantity * effectivePrice;
    const resultingNotional = intent.side === "buy" ? (context.existingNotional ?? 0) + notional + estimatedFee : 0;
    if (intent.side === "buy" && resultingNotional > this.limits.maxPositionValue) {
      return { allowed: false, reason: "position_value_limit" };
    }

    if (intent.stopLossPrice !== undefined) {
      const risk = Math.abs(effectivePrice - intent.stopLossPrice) * intent.quantity + estimatedFee;
      if (risk > this.limits.maxRiskPerTrade) {
        return { allowed: false, reason: "risk_per_trade_limit" };
      }
    }

    return { allowed: true };
  }
}
