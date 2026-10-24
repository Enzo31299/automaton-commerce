import { PaperExecutionAdapter, type PaperExecutionConfig } from "./execution.js";
import type { MarketDataProvider, MarketRequest, MarketSeries } from "./market-data.js";
import { PaperTradingLoop } from "./paper-loop.js";
import { PaperTradingSession } from "./paper-session.js";
import { PaperPortfolioStore } from "./paper-portfolio-store.js";
import type { PaperTradingDecision } from "./paper-trading-gate.js";
import { TradingRiskEngine } from "./risk-engine.js";
import { SqliteBackedTradingJournal, type KeyValueDatabase } from "./sqlite-journal.js";
import type { Strategy } from "./strategy.js";
import { TradingMemory } from "./trading-memory.js";
import { runTraderHeartbeat } from "./trader-heartbeat.js";
import type { RiskLimits } from "./types.js";

export interface TraderRuntimeConfig {
  initialEquity: number;
  quantity: number;
  stopLossFraction?: number;
  riskLimits: RiskLimits;
  journalLimit?: number;
  execution?: PaperExecutionConfig;
}

export interface TraderRuntime {
  tick(request: MarketRequest, prefetchedSeries?: MarketSeries): Promise<void>;
  snapshot(): ReturnType<PaperTradingSession["snapshot"]>;
}

export function createPaperTraderRuntime(
  db: KeyValueDatabase,
  marketData: MarketDataProvider,
  strategy: Strategy,
  eligibility: PaperTradingDecision,
  config: TraderRuntimeConfig,
): TraderRuntime {
  const risk = new TradingRiskEngine(config.riskLimits);
  const execution = new PaperExecutionAdapter(config.execution);
  const portfolioStore = new PaperPortfolioStore(db);
  const restored = portfolioStore.load()?.state;
  const session = new PaperTradingSession(eligibility, config.initialEquity, risk, execution, restored);
  const loop = new PaperTradingLoop(marketData, strategy, session, {
    quantity: config.quantity,
    ...(config.stopLossFraction === undefined ? {} : { stopLossFraction: config.stopLossFraction }),
  });
  const journal = new SqliteBackedTradingJournal(db, "trader:journal", config.journalLimit ?? 1000);
  const memory = new TradingMemory(db);

  return {
    async tick(request: MarketRequest, prefetchedSeries?: MarketSeries): Promise<void> {
      try {
        await runTraderHeartbeat(loop, journal, request, strategy.name, Date.now(), prefetchedSeries);
        memory.observe(await journal.recent(config.journalLimit ?? 1000));
        db.setKV("trader:last_tick", new Date().toISOString());
      } finally {
        // Paper execution mutates the in-memory session before journal writes.
        // Persist even when a later journal/memory/checkpoint write fails so a
        // restart cannot silently lose an already-simulated fill.
        portfolioStore.save(session.snapshot());
      }
    },
    snapshot: () => session.snapshot(),
  };
}
