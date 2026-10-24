import { createDatabase } from "../state/database.js";
import { CoinbaseExchangeMarketDataProvider } from "./coinbase-market-data.js";
import { createTraderPaperCycleTask } from "./heartbeat-task.js";
import { MomentumStrategy } from "./momentum-strategy.js";
import { createPaperServiceConfig, PAPER_SERVICE_STRATEGY, PAPER_SERVICE_SYMBOLS } from "./paper-service-config.js";
import { createPaperServiceLoop } from "./paper-service.js";
import { createPaperTraderRuntime } from "./runtime.js";
import { assertResearchPolicyCompatible } from "./research-policy-compatibility.js";
import { requireFreshResearchRun } from "./research-store.js";
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
    // Deployment is fail-closed: paper execution is disabled until recent
    // persisted out-of-sample research explicitly clears the exact configured
    // strategy on every required market under compatible execution assumptions.
    const research = requireFreshResearchRun(db);
    assertResearchPolicyCompatible(research.policy, config);

    const eligibility = evaluateStrategyAcrossMarkets(PAPER_SERVICE_STRATEGY, research.results, {
      requiredMarkets: PAPER_SERVICE_SYMBOLS,
    });
    if (!eligibility.eligible) {
      throw new Error(`Paper service research gate rejected strategy: ${eligibility.reasons.join(",")}`);
    }

    const strategy = new MomentumStrategy(20, 2);
    const marketData = new CoinbaseExchangeMarketDataProvider();
    const runtime = createPaperTraderRuntime(db, marketData, strategy, eligibility, {
      initialEquity: config.initialEquity,
      quantity: config.quantity,
      riskLimits: config.riskLimits,
      execution: config.execution,
    });
    const task = createTraderPaperCycleTask(runtime, config.requests, marketData, db);
    const service = createPaperServiceLoop(task, config.pollIntervalMs, undefined, config.maxConsecutiveTotalFailures);

    console.log(JSON.stringify({
      event: "paper_service_started",
      mode: "paper",
      strategy: PAPER_SERVICE_STRATEGY,
      symbols: PAPER_SERVICE_SYMBOLS,
      timeframe: "1h",
      researchCreatedAt: research.createdAt,
      researchPolicySchema: research.policy.schemaVersion,
      maxConsecutiveTotalFailures: config.maxConsecutiveTotalFailures,
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
