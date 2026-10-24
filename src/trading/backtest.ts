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

export interface BacktestEvaluationRange { tradeStartIndex?: number; }

function validateBacktestInputs(candles: readonly Candle[], config: BacktestConfig): void {
  if (!Number.isFinite(config.initialCapital) || config.initialCapital <= 0) {
    throw new Error("initialCapital must be finite and positive");
  }
  if (!Number.isFinite(config.feeRate) || config.feeRate < 0 || config.feeRate >= 1) {
    throw new Error("feeRate must be finite and in [0, 1)");
  }
  if (!Number.isFinite(config.allocationFraction) || config.allocationFraction < 0 || config.allocationFraction > 1) {
    throw new Error("allocationFraction must be finite and in [0, 1]");
  }

  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    const values = [candle.timestamp, candle.open, candle.high, candle.low, candle.close];
    if (values.some((value) => !Number.isFinite(value))) throw new Error("Candles must contain only finite values");
    if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
      throw new Error("Candle prices must be positive");
    }
    if (candle.low > candle.high || candle.open < candle.low || candle.open > candle.high || candle.close < candle.low || candle.close > candle.high) {
      throw new Error("Invalid OHLC candle");
    }
    if (candle.timestamp <= previousTimestamp) throw new Error("Candle timestamps must be strictly increasing");
    previousTimestamp = candle.timestamp;
  }
}

export function backtest(
  candles: readonly Candle[],
  strategy: Strategy,
  config: BacktestConfig,
  evaluation: BacktestEvaluationRange = {},
): BacktestMetrics {
  validateBacktestInputs(candles, config);
  let cash = config.initialCapital;
  let quantity = 0;
  let entryCost = 0;
  let peakEquity = cash;
  let maxDrawdownPct = 0;
  let trades = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  const tradeStartIndex = evaluation.tradeStartIndex ?? 0;
  if (!Number.isInteger(tradeStartIndex) || tradeStartIndex < 0 || tradeStartIndex > candles.length) throw new Error("Invalid tradeStartIndex");

  // A signal is only known after its candle closes. Execute that decision at
  // the next candle's open so the backtest cannot trade using a close price it
  // only learned at the end of the same candle.
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const signalIndex = index - 1;
    const signal = strategy.signal(candles.slice(0, signalIndex + 1));
    if (index < tradeStartIndex) continue;

    if (signal === "buy" && quantity === 0) {
      const budget = cash * config.allocationFraction;
      const fee = budget * config.feeRate;
      const spendable = budget - fee;
      quantity = spendable / candle.open;
      cash -= budget;
      entryCost = budget;
    } else if (signal === "sell" && quantity > 0) {
      const gross = quantity * candle.open;
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
