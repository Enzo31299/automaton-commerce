import { describe, expect, it } from "vitest";
import { createTraderHeartbeatConfig } from "../trading/heartbeat-config.js";

describe("trader heartbeat config", () => {
  it("contains no Conway wallet, credit, survival or social tasks", () => {
    const config = createTraderHeartbeatConfig();
    expect(config.entries.map((x) => x.name)).toEqual(["health_check", "trader_paper_cycle"]);
    expect(JSON.stringify(config)).not.toMatch(/usdc|credit|social|survival/i);
  });
});
