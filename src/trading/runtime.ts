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
      let heartbeatError: unknown;
      try {
        await runTraderHeartbeat(loop, journal, request, strategy.name, Date.now(), prefetchedSeries);
        memory.observe(await journal.recent(config.journalLimit ?? 1000));
      } catch (error) {
        heartbeatError = error;
      }

      try {
        // Paper execution mutates the in-memory session before journal writes.
        // Persist before publishing last_tick so a successful tick always has
        // durable portfolio state. On heartbeat failure, still attempt to save
        // any already-simulated fill without masking the original error.
        portfolioStore.save(session.snapshot());
      } catch (persistenceError) {
        if (heartbeatError !== undefined) throw heartbeatError;
        throw persistenceError;
      }

      if (heartbeatError !== undefined) throw heartbeatError;
      db.setKV("trader:last_tick", new Date().toISOString());
    },
    snapshot: () => session.snapshot(),
  };
}
