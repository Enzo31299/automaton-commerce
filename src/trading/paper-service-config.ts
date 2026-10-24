import type { MarketRequest } from "./market-data.js";
import type { RiskLimits } from "./types.js";

export const PAPER_SERVICE_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"] as const;
export const PAPER_SERVICE_TIMEFRAME = "1h" as const;

export interface PaperServiceConfig {
  dbPath: string;
  initialEquity: number;
  quantity: number;
  pollIntervalMs: number;
  requests: MarketRequest[];
  riskLimits: RiskLimits;
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function createPaperServiceConfig(env: NodeJS.ProcessEnv = process.env): PaperServiceConfig {
  const dbPath = env.TRADER_DB_PATH?.trim();
  if (!dbPath) throw new Error("TRADER_DB_PATH is required for durable paper state");

  const initialEquity = Number(env.TRADER_INITIAL_EQUITY ?? "150");
  const quantity = Number(env.TRADER_QUANTITY ?? "0.001");
  const pollIntervalMs = Number(env.TRADER_POLL_INTERVAL_MS ?? "60000");
  if (!positiveFinite(initialEquity)) throw new Error("TRADER_INITIAL_EQUITY must be positive and finite");
  if (!positiveFinite(quantity)) throw new Error("TRADER_QUANTITY must be positive and finite");
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 10_000) {
    throw new Error("TRADER_POLL_INTERVAL_MS must be a safe integer >= 10000");
  }

  const allowedSymbols = [...PAPER_SERVICE_SYMBOLS];
  const maxPositionValue = Number(env.TRADER_MAX_POSITION_VALUE ?? initialEquity * 0.25);
  const maxRiskPerTrade = Number(env.TRADER_MAX_RISK_PER_TRADE ?? initialEquity * 0.005);
  const maxDailyLoss = Number(env.TRADER_MAX_DAILY_LOSS ?? initialEquity * 0.02);
  const maxOpenPositions = Number(env.TRADER_MAX_OPEN_POSITIONS ?? "3");
  if (![maxPositionValue, maxRiskPerTrade, maxDailyLoss].every(positiveFinite)) {
    throw new Error("Trader risk limits must be positive and finite");
  }
  if (!Number.isSafeInteger(maxOpenPositions) || maxOpenPositions < 1 || maxOpenPositions > allowedSymbols.length) {
    throw new Error("TRADER_MAX_OPEN_POSITIONS is invalid");
  }

  return {
    dbPath,
    initialEquity,
    quantity,
    pollIntervalMs,
    requests: allowedSymbols.map((symbol) => ({ symbol, timeframe: PAPER_SERVICE_TIMEFRAME, limit: 300 })),
    riskLimits: { maxPositionValue, maxRiskPerTrade, maxDailyLoss, maxOpenPositions, allowedSymbols },
  };
}
