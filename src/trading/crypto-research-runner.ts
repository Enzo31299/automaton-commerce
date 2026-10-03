import type { FetchLike } from "./coinbase-market-data.js";
import { downloadCoinbaseHistory } from "./coinbase-history.js";
import { inspectCandleQuality } from "./data-quality.js";
import { MovingAverageCrossStrategy } from "./strategy.js";
import { MomentumStrategy } from "./momentum-strategy.js";
import { compareStrategies } from "./strategy-comparison.js";
import { buildResearchReport, type ResearchReportRow } from "./research-report.js";
import { evaluatePaperTradingEligibility, type PaperTradingDecision, type PaperTradingGate } from "./paper-trading-gate.js";
import type { BacktestConfig } from "./backtest.js";

export interface CryptoResearchRunnerConfig {
  symbols: readonly string[];
  timeframe: "1d";
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

export async function runCryptoResearch(
  config: CryptoResearchRunnerConfig,
  fetchFn?: FetchLike,
): Promise<CryptoResearchMarketResult[]> {
  const results: CryptoResearchMarketResult[] = [];
  for (const symbol of config.symbols) {
    const candles = await downloadCoinbaseHistory({
      symbol,
      timeframe: config.timeframe,
      start: config.start,
      end: config.end,
    }, fetchFn);

    const quality = inspectCandleQuality(candles, 86400, 0);
    if (!quality.valid) throw new Error(`Historical data quality failed for ${symbol}`);

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
