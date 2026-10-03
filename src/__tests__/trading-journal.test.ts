import { describe, expect, it } from "vitest";
import { InMemoryTradingJournal } from "../trading/trading-journal.js";

describe("trading journal", () => {
  it("stores immutable decision and result events", async () => {
    const journal = new InMemoryTradingJournal();
    await journal.append({
      timestamp: 1,
      type: "signal",
      symbol: "BTC-USD",
      strategy: "momentum",
      details: { signal: "buy", price: 100 },
    });
    await journal.append({
      timestamp: 2,
      type: "risk_block",
      symbol: "BTC-USD",
      details: { reason: "position_value_limit" },
    });
    const recent = await journal.recent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].type).toBe("risk_block");
  });
});
