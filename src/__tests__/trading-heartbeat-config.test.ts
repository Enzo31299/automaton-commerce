import { describe, expect, it } from "vitest";
import { createTraderHeartbeatConfig } from "../trading/heartbeat-config.js";

describe("trader heartbeat config", () => {
  it("contains no Conway wallet, credit, survival or social tasks", () => {
    const config = createTraderHeartbeatConfig();
    expect(config.entries.map((x) => x.name)).toEqual(["health_check", "trader_paper_cycle"]);
    expect(JSON.stringify(config)).not.toMatch(/usdc|credit|social|survival/i);
  });

  it("keeps the paper cycle on an explicit validated schedule", () => {
    const config = createTraderHeartbeatConfig("15 * * * *", 5_000);
    expect(config.entries.find((entry) => entry.name === "trader_paper_cycle")?.schedule).toBe("15 * * * *");
    expect(config.defaultIntervalMs).toBe(5_000);
  });

  it("rejects malformed schedules and unsafe polling intervals", () => {
    expect(() => createTraderHeartbeatConfig("")).toThrow(/five-field cron schedule/);
    expect(() => createTraderHeartbeatConfig("* * * *")).toThrow(/five-field cron schedule/);
    expect(() => createTraderHeartbeatConfig("0 * * * *", 999)).toThrow(/at least 1000 ms/);
    expect(() => createTraderHeartbeatConfig("0 * * * *", Number.NaN)).toThrow(/safe integer/);
    expect(() => createTraderHeartbeatConfig("0 * * * *", Number.POSITIVE_INFINITY)).toThrow(/safe integer/);
  });
});
