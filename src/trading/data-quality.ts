import type { Candle } from "./strategy.js";

export interface CandleQualityReport {
  candles: number;
  duplicateTimestamps: number;
  missingIntervals: number;
  largestGapIntervals: number;
  irregularIntervals: number;
  valid: boolean;
}

export function inspectCandleQuality(
  candles: readonly Candle[],
  intervalSeconds: number,
  maxMissingIntervals = 0,
): CandleQualityReport {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) throw new Error("intervalSeconds must be finite and positive");
  if (!Number.isInteger(maxMissingIntervals) || maxMissingIntervals < 0) throw new Error("maxMissingIntervals must be a non-negative integer");
  let duplicateTimestamps = 0;
  let missingIntervals = 0;
  let largestGapIntervals = 0;
  let irregularIntervals = 0;

  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i].timestamp;
    const previous = candles[i - 1].timestamp;
    if (!Number.isFinite(current) || !Number.isFinite(previous)) {
      return { candles: candles.length, duplicateTimestamps, missingIntervals, largestGapIntervals, irregularIntervals, valid: false };
    }
    const delta = current - previous;
    if (delta === 0) {
      duplicateTimestamps += 1;
      continue;
    }
    if (delta < 0) {
      return { candles: candles.length, duplicateTimestamps, missingIntervals, largestGapIntervals, irregularIntervals, valid: false };
    }

    if (delta > intervalSeconds && delta % intervalSeconds === 0) {
      // A whole-number gap is still aligned to the requested timeframe. Count
      // the absent candles separately so maxMissingIntervals can intentionally
      // tolerate small data holes without classifying them as malformed timing.
      const gapIntervals = (delta / intervalSeconds) - 1;
      missingIntervals += gapIntervals;
      largestGapIntervals = Math.max(largestGapIntervals, gapIntervals);
    } else if (delta !== intervalSeconds) {
      // Partial or otherwise off-grid intervals are malformed timing rather
      // than known missing whole candles and are never tolerated.
      irregularIntervals += 1;
    }
  }

  return {
    candles: candles.length,
    duplicateTimestamps,
    missingIntervals,
    largestGapIntervals,
    irregularIntervals,
    valid: duplicateTimestamps === 0 && irregularIntervals === 0 && missingIntervals <= maxMissingIntervals,
  };
}
