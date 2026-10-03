import type { KeyValueDatabase } from "./sqlite-journal.js";
import type { CryptoResearchMarketResult } from "./crypto-research-runner.js";

export interface StoredResearchRun {
  createdAt: string;
  results: CryptoResearchMarketResult[];
}

export function saveResearchRun(
  db: KeyValueDatabase,
  results: CryptoResearchMarketResult[],
  createdAt = new Date().toISOString(),
): StoredResearchRun {
  const run = { createdAt, results };
  db.setKV("trader:research:last", JSON.stringify(run));
  return run;
}

export function loadResearchRun(db: KeyValueDatabase): StoredResearchRun | undefined {
  const raw = db.getKV("trader:research:last");
  return raw ? JSON.parse(raw) as StoredResearchRun : undefined;
}
