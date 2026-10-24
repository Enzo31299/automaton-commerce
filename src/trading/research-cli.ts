import { createDatabase } from "../state/database.js";
import { runCryptoResearch } from "./crypto-research-runner.js";
import { saveResearchRun } from "./research-store.js";

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

function requiredPath(env: NodeJS.ProcessEnv): string {
  const value = env.TRADER_DB_PATH?.trim();
  if (!value) throw new Error("TRADER_DB_PATH is required to persist research results");
  return value;
}

async function main(): Promise<void> {
  const dbPath = requiredPath(process.env);
  // Historical download APIs and candle timestamps use Unix epoch seconds.
  // Stop at the previous completed hour to avoid researching a partial candle.
  const nowSeconds = Math.floor(Date.now() / 1000);
  const end = Math.floor((nowSeconds - HOUR_SECONDS) / HOUR_SECONDS) * HOUR_SECONDS;
  const start = end - 180 * DAY_SECONDS;

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
