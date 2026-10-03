import { describe, expect, it } from "vitest";
import { buildResearchReport, formatResearchReport } from "../trading/research-report.js";

describe("research report", () => {
  it("produces machine-readable strategy rows", () => {
    const rows = buildResearchReport("BTC-USD", [{
      name: "momentum",
      robustnessScore: 1.25,
      result: {
        windows: [],
        averageTestReturnPct: 2.5,
        worstTestDrawdownPct: 1.25,
        profitableWindows: 0,
      },
    }]);
    expect(rows[0]).toMatchObject({ market: "BTC-USD", strategy: "momentum" });
    expect(formatResearchReport(rows)).toContain("BTC-USD,momentum,2.5000,1.2500");
  });
});
