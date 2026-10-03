import { CoinbaseExchangeMarketDataProvider } from "./coinbase-market-data.js";
import { researchMarkets, type MarketResearchResult } from "./research.js";
import { MovingAverageCrossStrategy } from "./strategy.js";

export interface PublicCryptoResearchOptions {
  initialCapital?: number;
  feeRate?: number;
  allocationFraction?: number;
  trainSize?: number;
  testSize?: number;
}

export async function runPublicCryptoResearch(
  provider = new CoinbaseExchangeMarketDataProvider(),
  options: PublicCryptoResearchOptions = {},
): Promise<MarketResearchResult[]> {
  const {
    initialCapital = 150,
    feeRate = 0.006,
    allocationFraction = 0.25,
    trainSize = 120,
    testSize = 60,
  } = options;

  return researchMarkets(
    provider,
    [
      { symbol: "BTC-USD", timeframe: "1d" },
      { symbol: "ETH-USD", timeframe: "1d" },
    ],
    () => new MovingAverageCrossStrategy(20, 50),
    { initialCapital, feeRate, allocationFraction },
    trainSize,
    testSize,
  );
}
