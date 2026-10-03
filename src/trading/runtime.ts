import { PaperExecutionAdapter } from "./execution.js";
import type { MarketDataProvider, MarketRequest } from "./market-data.js";
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
}

export interface TraderRuntime {
  tick(request: MarketRequest): Promise<void>;
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
  const execution = new PaperExecutionAdapter();
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
    async tick(request: MarketRequest): Promise<void> {
      await runTraderHeartbeat(loop, journal, request, strategy.name);
      memory.observe(await journal.recent(config.journalLimit ?? 1000));
      portfolioStore.save(session.snapshot());
      db.setKV("trader:last_tick", new Date().toISOString());
    },
    snapshot: () => session.snapshot(),
  };
}
