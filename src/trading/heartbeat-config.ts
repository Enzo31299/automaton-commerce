import type { HeartbeatConfig } from "../types.js";

export function createTraderHeartbeatConfig(
  schedule = "0 * * * *",
  defaultIntervalMs = 60_000,
): HeartbeatConfig {
  return {
    entries: [
      { name: "health_check", schedule: "*/30 * * * *", task: "health_check", enabled: true },
      { name: "trader_paper_cycle", schedule, task: "trader_paper_cycle", enabled: true },
    ],
    defaultIntervalMs,
    lowComputeMultiplier: 1,
  };
}
