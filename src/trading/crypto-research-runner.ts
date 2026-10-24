import type { FetchLike } from "./coinbase-market-data.js";
import { downloadCoinbaseHistory } from "./coinbase-history.js";
import { inspectCandleQuality } from "./data-quality.js";
import { MovingAverageCrossStrategy } from "./strategy.js";
import { MomentumStrategy } from "./momentum-strategy.js";
import { compareStrategies } from "./strategy-comparison.js";
import { buildResearchReport, type ResearchReportRow } from "./research-report.js";
import { evaluatePaperTradingEligibility, type PaperTradingDecision, type PaperTradingGate } from "./paper-trading-gate.js";
import type { BacktestConfig } from "./backtest.js";

const RESEARCH_INTERVAL_SECONDS = { "1h": 3600, "1d": 86400 } as const;
const MAX_RESEARCH_MISSING_INTERVALS = 5;
const MAX_RESEARCH_SINGLE_GAP_INTERVALS = 5;
export type CryptoResearchTimeframe = keyof typeof RESEARCH_INTERVAL_SECONDS;

export interface CryptoResearchRunnerConfig {
  symbols: readonly string[];
  timeframe: CryptoResearchTimeframe;
  start: number;
  end: number;
  trainSize: number;
  testSize: number;
  backtest: BacktestConfig;
  gate: PaperTradingGate;
}

export interface CryptoResearchMarketResult {
  symbol: string;
  rows: ResearchReportRow[];
  decisions: Record<string, PaperTradingDecision>;
}

function validateResearchCosts(config: BacktestConfig): void {
  if (!Number.isFinite(config.feeRate) || config.feeRate <= 0) {
    throw new Error("Crypto research requires a positive feeRate");
  }
  if (!Number.isFinite(config.slippageRate) || config.slippageRate === undefined || config.slippageRate <= 0) {
    throw new Error("Crypto research requires a positive slippageRate");
  }
}

export async function runCryptoResearch(
  config: CryptoResearchRunnerConfig,
  fetchFn?: FetchLike,
): Promise<CryptoResearchMarketResult[]> {
  validateResearchCosts(config.backtest);

  const intervalSeconds = RESEARCH_INTERVAL_SECONDS[config.timeframe];
  const results: CryptoResearchMarketResult[] = [];
  for (const symbol of config.symbols) {
    const candles = await downloadCoinbaseHistory({
      symbol,
      timeframe: config.timeframe,
      start: config.start,
      end: config.end,
    }, fetchFn);

    const quality = inspectCandleQuality(candles, intervalSeconds, MAX_RESEARCH_MISSING_INTERVALS);
    if (!quality.valid || quality.largestGapIntervals > MAX_RESEARCH_SINGLE_GAP_INTERVALS) {
      throw new Error(
        `Historical data quality failed for ${symbol}: candles=${quality.candles}, missingIntervals=${quality.missingIntervals}, largestGapIntervals=${quality.largestGapIntervals}, duplicateTimestamps=${quality.duplicateTimestamps}, irregularIntervals=${quality.irregularIntervals}`,
      );
    }

    const comparisons = compareStrategies(
      candles,
      [
        { name: "ma-20-50", create: () => new MovingAverageCrossStrategy(20, 50) },
        { name: "momentum-20-2", create: () => new MomentumStrategy(20, 2) },
      ],
      config.backtest,
      config.trainSize,
      config.testSize,
    );
    const rows = buildResearchReport(symbol, comparisons);
    const decisions = Object.fromEntries(rows.map((row) => [
      row.strategy,
      evaluatePaperTradingEligibility(row, config.gate),
    ]));
    results.push({ symbol, rows, decisions });
  }
  return results;
}
