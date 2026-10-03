import type { PortfolioState, RiskDecision, RiskLimits, TradeIntent } from "./types.js";

export class TradingRiskEngine {
  constructor(private readonly limits: RiskLimits) {}

  evaluate(intent: TradeIntent, portfolio: PortfolioState): RiskDecision {
    if (!Number.isFinite(intent.quantity) || intent.quantity <= 0) {
      return { allowed: false, reason: "invalid_quantity" };
    }
    if (!Number.isFinite(intent.price) || intent.price <= 0) {
      return { allowed: false, reason: "invalid_price" };
    }
    if (!this.limits.allowedSymbols.includes(intent.symbol)) {
      return { allowed: false, reason: "symbol_not_allowed" };
    }
    if (portfolio.openPositions >= this.limits.maxOpenPositions) {
      return { allowed: false, reason: "max_open_positions" };
    }
    if (portfolio.dailyPnl <= -Math.abs(this.limits.maxDailyLoss)) {
      return { allowed: false, reason: "daily_loss_limit" };
    }

    const notional = intent.quantity * intent.price;
    if (notional > this.limits.maxPositionValue) {
      return { allowed: false, reason: "position_value_limit" };
    }

    if (intent.stopLossPrice !== undefined) {
      const risk = Math.abs(intent.price - intent.stopLossPrice) * intent.quantity;
      if (risk > this.limits.maxRiskPerTrade) {
        return { allowed: false, reason: "risk_per_trade_limit" };
      }
    }

    return { allowed: true };
  }
}
