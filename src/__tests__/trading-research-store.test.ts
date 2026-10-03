import { describe, expect, it } from "vitest";
import { loadResearchRun, saveResearchRun } from "../trading/research-store.js";

describe("research store", () => {
  it("persists the latest gated research result", () => {
    const store = new Map<string, string>();
    const db = { getKV: (k: string) => store.get(k), setKV: (k: string, v: string) => { store.set(k, v); } };
    saveResearchRun(db, [{ symbol: "BTC-USD", rows: [], decisions: {} }], "2026-01-01T00:00:00.000Z");
    expect(loadResearchRun(db)).toMatchObject({ createdAt: "2026-01-01T00:00:00.000Z", results: [{ symbol: "BTC-USD" }] });
  });
});
