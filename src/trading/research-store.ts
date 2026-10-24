import type { KeyValueDatabase } from "./sqlite-journal.js";
import type { CryptoResearchMarketResult } from "./crypto-research-runner.js";
import type { PaperResearchPolicy } from "./research-policy.js";

export const MAX_RESEARCH_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredResearchRun {
  createdAt: string;
  policy: PaperResearchPolicy;
  results: CryptoResearchMarketResult[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGate(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const gate = value as Record<string, unknown>;
  return Number.isSafeInteger(gate.minWindows) && (gate.minWindows as number) > 0
    && isFiniteNumber(gate.minProfitableWindowRatio) && (gate.minProfitableWindowRatio as number) >= 0 && (gate.minProfitableWindowRatio as number) <= 1
    && isFiniteNumber(gate.maxDrawdownPct) && (gate.maxDrawdownPct as number) >= 0
    && isFiniteNumber(gate.minAverageTestReturnPct);
}

function isPolicy(value: unknown): value is PaperResearchPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  return policy.schemaVersion === 1
    && Array.isArray(policy.symbols) && policy.symbols.length > 0
    && policy.symbols.every((symbol) => typeof symbol === "string" && symbol.trim().length > 0)
    && new Set(policy.symbols as string[]).size === policy.symbols.length
    && policy.timeframe === "1h"
    && policy.strategy === "momentum-20-2"
    && isFiniteNumber(policy.feeRate) && (policy.feeRate as number) > 0 && (policy.feeRate as number) < 1
    && isFiniteNumber(policy.slippageRate) && (policy.slippageRate as number) > 0 && (policy.slippageRate as number) < 1
    && isFiniteNumber(policy.allocationFraction) && (policy.allocationFraction as number) > 0 && (policy.allocationFraction as number) <= 1
    && isFiniteNumber(policy.initialCapital) && (policy.initialCapital as number) > 0
    && Number.isSafeInteger(policy.trainSize) && (policy.trainSize as number) > 0
    && Number.isSafeInteger(policy.testSize) && (policy.testSize as number) > 0
    && isGate(policy.gate);
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
  if (typeof run.createdAt !== "string" || !Number.isFinite(Date.parse(run.createdAt)) || !isPolicy(run.policy)) {
    throw new Error("Stored research run is invalid");
  }
  if (!Array.isArray(run.results) || run.results.length === 0 || !run.results.every(isMarketResult)) {
    throw new Error("Stored research run is invalid");
  }
  const symbols = run.results.map((result) => result.symbol.trim());
  if (new Set(symbols).size !== symbols.length) throw new Error("Stored research run is invalid");
  if (symbols.length !== run.policy.symbols.length || !run.policy.symbols.every((symbol) => symbols.includes(symbol))) {
    throw new Error("Stored research run policy does not match research results");
  }
  return run as unknown as StoredResearchRun;
}

export function saveResearchRun(
  db: KeyValueDatabase,
  results: CryptoResearchMarketResult[],
  policy: PaperResearchPolicy,
  createdAt = new Date().toISOString(),
): StoredResearchRun {
  const run = validateRun({ createdAt, policy, results });
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
