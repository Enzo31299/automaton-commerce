import { describe, expect, it } from "vitest";
import { inspectCandleQuality } from "../trading/data-quality.js";

const c = (timestamp: number) => ({ timestamp, open: 1, high: 1, low: 1, close: 1 });

describe("historical candle quality", () => {
  it("accepts a continuous series", () => {
    expect(inspectCandleQuality([c(0), c(60), c(120)], 60)).toMatchObject({ valid: true, missingIntervals: 0 });
  });
  it("detects missing intervals", () => {
    expect(inspectCandleQuality([c(0), c(180)], 60)).toMatchObject({ valid: false, missingIntervals: 2, largestGapIntervals: 2 });
  });
  it("rejects duplicate timestamps", () => {
    expect(inspectCandleQuality([c(0), c(0)], 60).valid).toBe(false);
  });
});
