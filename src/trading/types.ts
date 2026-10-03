export type Side = "buy" | "sell";

export interface MarketQuote {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface TradeIntent {
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  stopLossPrice?: number;
}

export interface RiskLimits {
  maxPositionValue: number;
  maxRiskPerTrade: number;
  maxDailyLoss: number;
  maxOpenPositions: number;
  allowedSymbols: string[];
}

export interface PortfolioState {
  equity: number;
  dailyPnl: number;
  openPositions: number;
}

export interface RiskDecision {
  allowed: boolean;
  reason?: string;
}

export interface ExecutionResult {
  id: string;
  mode: "paper";
  symbol: string;
  side: Side;
  quantity: number;
  fillPrice: number;
  notional: number;
  timestamp: number;
}
