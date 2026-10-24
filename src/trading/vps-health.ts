import type { KeyValueDatabase } from "./sqlite-journal.js";

export interface TraderHealthStatus {
  healthy: boolean;
  mode: "paper";
  lastTick?: string;
  ageMs?: number;
  reasons: string[];
}

export function inspectPaperTraderHealth(
  db: KeyValueDatabase,
  now = Date.now(),
  maxTickAgeMs = 2 * 60 * 60 * 1000,
): TraderHealthStatus {
  if (!Number.isFinite(now) || !Number.isSafeInteger(maxTickAgeMs) || maxTickAgeMs < 1_000) {
    return { healthy: false, mode: "paper", reasons: ["invalid_health_configuration"] };
  }

  const lastTick = db.getKV("trader:last_tick");
  if (!lastTick) return { healthy: false, mode: "paper", reasons: ["missing_last_tick"] };

  const parsed = Date.parse(lastTick);
  if (!Number.isFinite(parsed)) {
    return { healthy: false, mode: "paper", lastTick, reasons: ["invalid_last_tick"] };
  }

  const ageMs = now - parsed;
  if (ageMs < 0) {
    return { healthy: false, mode: "paper", lastTick, ageMs, reasons: ["last_tick_in_future"] };
  }
  if (ageMs > maxTickAgeMs) {
    return { healthy: false, mode: "paper", lastTick, ageMs, reasons: ["stale_last_tick"] };
  }

  return { healthy: true, mode: "paper", lastTick, ageMs, reasons: [] };
}
