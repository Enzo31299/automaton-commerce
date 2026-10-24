import { createDatabase } from "../state/database.js";
import { runCryptoResearch } from "./crypto-research-runner.js";
import { createPaperResearchPolicy } from "./research-policy.js";
import { saveResearchRun } from "./research-store.js";
import { createHourlyResearchWindow } from "./research-window.js";

function requiredPath(env: NodeJS.ProcessEnv): string {
  const value = env.TRADER_DB_PATH?.trim();
  if (!value) throw new Error("TRADER_DB_PATH is required to persist research results");
  return value;
}

async function main(): Promise<void> {
  const dbPath = requiredPath(process.env);
  const { start, end } = createHourlyResearchWindow(Date.now());
  const policy = createPaperResearchPolicy();

  const results = await runCryptoResearch({
    symbols: policy.symbols,
    timeframe: policy.timeframe,
    start,
    end,
    trainSize: policy.trainSize,
    testSize: policy.testSize,
    backtest: {
      initialCapital: policy.initialCapital,
      feeRate: policy.feeRate,
      slippageRate: policy.slippageRate,
      allocationFraction: policy.allocationFraction,
    },
    gate: {
      minWindows: 4,
      minProfitableWindowRatio: 0.5,
      maxDrawdownPct: 10,
      minAverageTestReturnPct: 0,
    },
  });

  const db = createDatabase(dbPath);
  try {
    const stored = saveResearchRun(db, results);
    console.log(JSON.stringify({
      event: "trader_research_complete",
      mode: "paper",
      policy,
      start: new Date(start * 1000).toISOString(),
      end: new Date(end * 1000).toISOString(),
      createdAt: stored.createdAt,
      results,
    }, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    event: "trader_research_fatal",
    mode: "paper",
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
