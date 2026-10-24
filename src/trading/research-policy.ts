export const PAPER_RESEARCH_SCHEMA_VERSION = 1 as const;
export const PAPER_RESEARCH_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"] as const;
export const PAPER_RESEARCH_TIMEFRAME = "1h" as const;
export const PAPER_RESEARCH_STRATEGY = "momentum-20-2" as const;
export const PAPER_RESEARCH_FEE_RATE = 0.001;
export const PAPER_RESEARCH_SLIPPAGE_RATE = 0.0005;
export const PAPER_RESEARCH_ALLOCATION_FRACTION = 0.25;
export const PAPER_RESEARCH_INITIAL_CAPITAL = 150;
export const PAPER_RESEARCH_TRAIN_SIZE = 24 * 30;
export const PAPER_RESEARCH_TEST_SIZE = 24 * 14;
export const PAPER_RESEARCH_GATE = Object.freeze({
  minWindows: 4,
  minProfitableWindowRatio: 0.5,
  maxDrawdownPct: 10,
  minAverageTestReturnPct: 0,
});

export interface PaperResearchPolicy {
  schemaVersion: typeof PAPER_RESEARCH_SCHEMA_VERSION;
  symbols: string[];
  timeframe: typeof PAPER_RESEARCH_TIMEFRAME;
  strategy: typeof PAPER_RESEARCH_STRATEGY;
  feeRate: number;
  slippageRate: number;
  allocationFraction: number;
  initialCapital: number;
  trainSize: number;
  testSize: number;
  gate: {
    minWindows: number;
    minProfitableWindowRatio: number;
    maxDrawdownPct: number;
    minAverageTestReturnPct: number;
  };
}

export function createPaperResearchPolicy(): PaperResearchPolicy {
  return {
    schemaVersion: PAPER_RESEARCH_SCHEMA_VERSION,
    symbols: [...PAPER_RESEARCH_SYMBOLS],
    timeframe: PAPER_RESEARCH_TIMEFRAME,
    strategy: PAPER_RESEARCH_STRATEGY,
    feeRate: PAPER_RESEARCH_FEE_RATE,
    slippageRate: PAPER_RESEARCH_SLIPPAGE_RATE,
    allocationFraction: PAPER_RESEARCH_ALLOCATION_FRACTION,
    initialCapital: PAPER_RESEARCH_INITIAL_CAPITAL,
    trainSize: PAPER_RESEARCH_TRAIN_SIZE,
    testSize: PAPER_RESEARCH_TEST_SIZE,
    gate: { ...PAPER_RESEARCH_GATE },
  };
}
