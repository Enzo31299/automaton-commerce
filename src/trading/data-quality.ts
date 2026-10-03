import type { Candle } from "./strategy.js";

export interface CandleQualityReport {
  candles: number;
  duplicateTimestamps: number;
  missingIntervals: number;
  largestGapIntervals: number;
  valid: boolean;
}

export function inspectCandleQuality(
  candles: readonly Candle[],
  intervalSeconds: number,
  maxMissingIntervals = 0,
): CandleQualityReport {
  if (intervalSeconds <= 0) throw new Error("intervalSeconds must be positive");
  let duplicateTimestamps = 0;
  let missingIntervals = 0;
  let largestGapIntervals = 0;

  for (let i = 1; i < candles.length; i += 1) {
    const delta = candles[i].timestamp - candles[i - 1].timestamp;
    if (delta === 0) {
      duplicateTimestamps += 1;
      continue;
    }
    if (delta < 0) {
      return { candles: candles.length, duplicateTimestamps, missingIntervals, largestGapIntervals, valid: false };
    }
    if (delta > intervalSeconds) {
      const gapIntervals = Math.max(0, Math.round(delta / intervalSeconds) - 1);
      missingIntervals += gapIntervals;
      largestGapIntervals = Math.max(largestGapIntervals, gapIntervals);
    }
  }

  return {
    candles: candles.length,
    duplicateTimestamps,
    missingIntervals,
    largestGapIntervals,
    valid: duplicateTimestamps === 0 && missingIntervals <= maxMissingIntervals,
  };
}
