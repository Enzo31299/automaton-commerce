import { walkForward, type WalkForwardResult } from "./walk-forward.js";
import type { BacktestConfig } from "./backtest.js";
import type { MarketDataProvider, MarketRequest } from "./market-data.js";
import { validateMarketSeries } from "./market-data.js";
import type { Candle, Strategy } from "./strategy.js";

export interface MarketResearchResult {
  symbol: string;
  timeframe: string;
  source: string;
  result: WalkForwardResult;
}

export async function researchMarkets(
  provider: MarketDataProvider,
  requests: readonly MarketRequest[],
  strategyFactory: (training: readonly Candle[]) => Strategy,
  config: BacktestConfig,
  trainSize: number,
  testSize: number,
): Promise<MarketResearchResult[]> {
  const results: MarketResearchResult[] = [];
  for (const request of requests) {
    const series = await provider.getCandles(request);
    validateMarketSeries(series);
    results.push({
      symbol: series.symbol,
      timeframe: series.timeframe,
      source: series.source,
      result: walkForward(series.candles, strategyFactory, config, trainSize, testSize),
    });
  }
  return results;
}
