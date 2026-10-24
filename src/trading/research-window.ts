const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export interface ResearchWindow {
  start: number;
  end: number;
}

export function createHourlyResearchWindow(nowMs: number, lookbackDays = 180): ResearchWindow {
  if (!Number.isFinite(nowMs) || nowMs <= 0) throw new Error("Research clock must be positive and finite");
  if (!Number.isSafeInteger(lookbackDays) || lookbackDays < 1) throw new Error("Research lookback days must be a positive safe integer");

  const nowSeconds = Math.floor(nowMs / 1000);
  // Exclude the current hour even when called exactly on an hour boundary so
  // historical research never includes a candle that may still be settling.
  const end = Math.floor((nowSeconds - HOUR_SECONDS) / HOUR_SECONDS) * HOUR_SECONDS;
  const start = end - lookbackDays * DAY_SECONDS;
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end <= start) {
    throw new Error("Research window is outside the supported epoch range");
  }
  return { start, end };
}
