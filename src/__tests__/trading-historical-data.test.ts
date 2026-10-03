import { describe, expect, it } from "vitest";
import { HistoricalCsvProvider, parseOhlcCsv } from "../trading/historical-data.js";

const csv = `timestamp,open,high,low,close
1,100,105,99,104
2,104,108,103,107
3,107,109,101,102
`;

describe("historical market imports", () => {
  it("parses deterministic OHLC CSV datasets", () => {
    const candles = parseOhlcCsv(csv);
    expect(candles).toHaveLength(3);
    expect(candles[1].close).toBe(107);
  });

  it("filters imported history by request", async () => {
    const provider = new HistoricalCsvProvider([
      { symbol: "BTC-USD", timeframe: "1d", source: "fixture", csv },
    ]);
    const series = await provider.getCandles({ symbol: "BTC-USD", timeframe: "1d", start: 2 });
    expect(series.candles.map((x) => x.timestamp)).toEqual([2, 3]);
    expect(series.source).toBe("fixture");
  });

  it("rejects incomplete schemas", () => {
    expect(() => parseOhlcCsv("timestamp,close\n1,100")).toThrow();
  });
});
