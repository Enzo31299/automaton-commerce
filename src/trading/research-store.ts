import type { KeyValueDatabase } from "./sqlite-journal.js";
import type { CryptoResearchMarketResult } from "./crypto-research-runner.js";

export const MAX_RESEARCH_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredResearchRun {
  createdAt: string;
  results: CryptoResearchMarketResult[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDecision(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const decision = value as Record<string, unknown>;
  return typeof decision.eligible === "boolean"
    && Array.isArray(decision.reasons)
    && decision.reasons.every((reason) => typeof reason === "string");
}

function isResearchRow(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.market === "string" && row.market.trim().length > 0
    && typeof row.strategy === "string" && row.strategy.trim().length > 0
    && isFiniteNumber(row.averageTestReturnPct)
    && isFiniteNumber(row.worstTestDrawdownPct) && row.worstTestDrawdownPct >= 0
    && Number.isSafeInteger(row.profitableWindows) && (row.profitableWindows as number) >= 0
    && Number.isSafeInteger(row.totalWindows) && (row.totalWindows as number) >= 0
    && (row.profitableWindows as number) <= (row.totalWindows as number)
    && isFiniteNumber(row.robustnessScore);
}

function isMarketResult(value: unknown): value is CryptoResearchMarketResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (typeof result.symbol !== "string" || result.symbol.trim().length === 0) return false;
  if (!Array.isArray(result.rows) || !result.rows.every(isResearchRow)) return false;
  if (!result.decisions || typeof result.decisions !== "object" || Array.isArray(result.decisions)) return false;
  return Object.entries(result.decisions as Record<string, unknown>)
    .every(([strategy, decision]) => strategy.trim().length > 0 && isDecision(decision));
}

function validateRun(value: unknown): StoredResearchRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Stored research run is invalid");
  const run = value as Record<string, unknown>;
  if (typeof run.createdAt !== "string" || !Number.isFinite(Date.parse(run.createdAt))) {
    throw new Error("Stored research run is invalid");
  }
  if (!Array.isArray(run.results) || run.results.length === 0 || !run.results.every(isMarketResult)) {
    throw new Error("Stored research run is invalid");
  }
  const symbols = run.results.map((result) => result.symbol.trim());
  if (new Set(symbols).size !== symbols.length) throw new Error("Stored research run is invalid");
  return run as unknown as StoredResearchRun;
}

export function saveResearchRun(
  db: KeyValueDatabase,
  results: CryptoResearchMarketResult[],
  createdAt = new Date().toISOString(),
): StoredResearchRun {
  const run = validateRun({ createdAt, results });
  db.setKV("trader:research:last", JSON.stringify(run));
  return run;
}

export function loadResearchRun(db: KeyValueDatabase): StoredResearchRun | undefined {
  const raw = db.getKV("trader:research:last");
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Stored research run is invalid");
  }
  return validateRun(parsed);
}

export function requireFreshResearchRun(
  db: KeyValueDatabase,
  now = Date.now(),
  maxAgeMs = MAX_RESEARCH_AGE_MS,
): StoredResearchRun {
  if (!Number.isFinite(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1_000) {
    throw new Error("Research freshness configuration is invalid");
  }
  const run = loadResearchRun(db);
  if (!run) throw new Error("Paper service requires persisted out-of-sample research");
  const createdAt = Date.parse(run.createdAt);
  const ageMs = now - createdAt;
  if (ageMs < 0) throw new Error("Persisted out-of-sample research is dated in the future");
  if (ageMs > maxAgeMs) throw new Error("Persisted out-of-sample research is stale");
  return run;
}
