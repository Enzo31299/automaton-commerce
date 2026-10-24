import type { HeartbeatConfig } from "../types.js";

function requireCronSchedule(value: string, name: string): string {
  const schedule = value.trim();
  if (!schedule || schedule.split(/\s+/).length !== 5) {
    throw new Error(`${name} must be a non-empty five-field cron schedule`);
  }
  return schedule;
}

export function createTraderHeartbeatConfig(
  schedule = "0 * * * *",
  defaultIntervalMs = 60_000,
): HeartbeatConfig {
  const traderSchedule = requireCronSchedule(schedule, "Trader paper schedule");
  if (!Number.isSafeInteger(defaultIntervalMs) || defaultIntervalMs < 1_000) {
    throw new Error("Trader heartbeat interval must be a safe integer of at least 1000 ms");
  }

  return {
    entries: [
      { name: "health_check", schedule: "*/30 * * * *", task: "health_check", enabled: true },
      { name: "trader_paper_cycle", schedule: traderSchedule, task: "trader_paper_cycle", enabled: true },
    ],
    defaultIntervalMs,
    lowComputeMultiplier: 1,
  };
}
