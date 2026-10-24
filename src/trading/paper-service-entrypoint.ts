import { createDatabase } from "../state/database.js";
import { CoinbaseExchangeMarketDataProvider } from "./coinbase-market-data.js";
import { createTraderPaperCycleTask } from "./heartbeat-task.js";
import { MomentumStrategy } from "./momentum-strategy.js";
import { createPaperServiceConfig, PAPER_SERVICE_SYMBOLS } from "./paper-service-config.js";
import { createPaperServiceLoop } from "./paper-service.js";
import { createPaperTraderRuntime } from "./runtime.js";
import { loadResearchRun } from "./research-store.js";
import { evaluateStrategyAcrossMarkets } from "./research-portfolio-gate.js";

async function main(): Promise<void> {
  const config = createPaperServiceConfig();
  const db = createDatabase(config.dbPath);
  const controller = new AbortController();
  let closing = false;

  const shutdown = () => {
    if (closing) return;
    closing = true;
    controller.abort();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  try {
    // Deployment is fail-closed: paper execution is disabled until persisted
    // out-of-sample research explicitly clears the same strategy on every
    // required market. No live execution adapter is constructed in this process.
    const research = loadResearchRun(db);
    if (!research) throw new Error("Paper service requires persisted out-of-sample research");

    const strategy = new MomentumStrategy(20, 2);
    const eligibility = evaluateStrategyAcrossMarkets(strategy.name, research.results, {
      requiredMarkets: PAPER_SERVICE_SYMBOLS,
    });
    if (!eligibility.eligible) {
      throw new Error(`Paper service research gate rejected strategy: ${eligibility.reasons.join(",")}`);
    }

    const marketData = new CoinbaseExchangeMarketDataProvider();
    const runtime = createPaperTraderRuntime(db, marketData, strategy, eligibility, {
      initialEquity: config.initialEquity,
      quantity: config.quantity,
      riskLimits: config.riskLimits,
      execution: { feeRate: 0.001, slippageRate: 0.0005 },
    });
    const task = createTraderPaperCycleTask(runtime, config.requests, marketData, db);
    const service = createPaperServiceLoop(task, config.pollIntervalMs);

    console.log(JSON.stringify({
      event: "paper_service_started",
      mode: "paper",
      symbols: PAPER_SERVICE_SYMBOLS,
      timeframe: "1h",
    }));
    await service.run(controller.signal);
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    event: "paper_service_fatal",
    mode: "paper",
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
