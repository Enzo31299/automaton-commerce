import { createDatabase } from "../state/database.js";
import { runCryptoResearch } from "./crypto-research-runner.js";
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

  const results = await runCryptoResearch({
    symbols: ["BTC-USD", "ETH-USD", "SOL-USD"],
    timeframe: "1h",
    start,
    end,
    trainSize: 24 * 30,
    testSize: 24 * 14,
    backtest: {
      initialCapital: 150,
      feeRate: 0.001,
      slippageRate: 0.0005,
      allocationFraction: 0.25,
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
      timeframe: "1h",
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
