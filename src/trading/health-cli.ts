import { createDatabase } from "../state/database.js";
import { inspectPaperTraderHealth } from "./vps-health.js";

function requiredDbPath(env: NodeJS.ProcessEnv): string {
  const value = env.TRADER_DB_PATH?.trim();
  if (!value) throw new Error("TRADER_DB_PATH is required for paper health checks");
  return value;
}

function maxTickAge(env: NodeJS.ProcessEnv): number {
  const value = Number(env.TRADER_HEALTH_MAX_TICK_AGE_MS ?? String(2 * 60 * 60 * 1000));
  if (!Number.isSafeInteger(value) || value < 1_000) {
    throw new Error("TRADER_HEALTH_MAX_TICK_AGE_MS must be a safe integer >= 1000");
  }
  return value;
}

function main(): void {
  const db = createDatabase(requiredDbPath(process.env));
  try {
    const status = inspectPaperTraderHealth(db, Date.now(), maxTickAge(process.env));
    console.log(JSON.stringify(status));
    if (!status.healthy) process.exitCode = 1;
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(JSON.stringify({
    healthy: false,
    mode: "paper",
    reasons: ["health_check_failed"],
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
}
