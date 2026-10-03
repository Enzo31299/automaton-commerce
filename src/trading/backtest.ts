import type { Candle, Strategy } from "./strategy.js";

export interface BacktestConfig {
  initialCapital: number;
  feeRate: number;
  allocationFraction: number;
}

export interface BacktestMetrics {
  initialCapital: number;
  finalEquity: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  trades: number;
  winningTrades: number;
  losingTrades: number;
}

export function backtest(
  candles: readonly Candle[],
  strategy: Strategy,
  config: BacktestConfig,
): BacktestMetrics {
  let cash = config.initialCapital;
  let quantity = 0;
  let entryCost = 0;
  let peakEquity = cash;
  let maxDrawdownPct = 0;
  let trades = 0;
  let winningTrades = 0;
  let losingTrades = 0;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const signal = strategy.signal(candles.slice(0, index + 1));

    if (signal === "buy" && quantity === 0) {
      const budget = cash * config.allocationFraction;
      const fee = budget * config.feeRate;
      const spendable = budget - fee;
      quantity = spendable / candle.close;
      cash -= budget;
      entryCost = budget;
    } else if (signal === "sell" && quantity > 0) {
      const gross = quantity * candle.close;
      const proceeds = gross * (1 - config.feeRate);
      const pnl = proceeds - entryCost;
      cash += proceeds;
      quantity = 0;
      entryCost = 0;
      trades += 1;
      if (pnl > 0) winningTrades += 1;
      else if (pnl < 0) losingTrades += 1;
    }

    const equity = cash + quantity * candle.close;
    peakEquity = Math.max(peakEquity, equity);
    const drawdown = peakEquity === 0 ? 0 : ((peakEquity - equity) / peakEquity) * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdown);
  }

  const lastPrice = candles.at(-1)?.close ?? 0;
  const finalEquity = cash + quantity * lastPrice;
  return {
    initialCapital: config.initialCapital,
    finalEquity,
    netReturnPct: ((finalEquity / config.initialCapital) - 1) * 100,
    maxDrawdownPct,
    trades,
    winningTrades,
    losingTrades,
  };
}
