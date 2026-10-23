import { describe, expect, it } from "vitest";
import { inspectCandleQuality } from "../trading/data-quality.js";

const c = (timestamp: number) => ({ timestamp, open: 1, high: 1, low: 1, close: 1 });

describe("historical candle quality", () => {
  it("accepts a continuous series", () => {
    expect(inspectCandleQuality([c(0), c(60), c(120)], 60)).toMatchObject({ valid: true, missingIntervals: 0, irregularIntervals: 0 });
  });
  it("detects missing intervals", () => {
    expect(inspectCandleQuality([c(0), c(180)], 60)).toMatchObject({ valid: false, missingIntervals: 2, largestGapIntervals: 2, irregularIntervals: 1 });
  });
  it("rejects duplicate timestamps", () => {
    expect(inspectCandleQuality([c(0), c(0)], 60).valid).toBe(false);
  });
  it("rejects partial irregular intervals without inventing a missing candle", () => {
    expect(inspectCandleQuality([c(0), c(89)], 60)).toMatchObject({
      valid: false,
      missingIntervals: 0,
      largestGapIntervals: 0,
      irregularIntervals: 1,
    });
  });
  it("rejects invalid quality configuration", () => {
    expect(() => inspectCandleQuality([], Number.NaN)).toThrow(/finite and positive/);
    expect(() => inspectCandleQuality([], 60, -1)).toThrow(/non-negative integer/);
  });
});
