import { describe, expect, it } from "vitest";
import { validateIbkrPaperEntry, validateIbkrPaperPreflight } from "./ibkr-paper-preflight.js";

const valid = {
  executionMode: "IBKR_PAPER",
  verifiedAccountMode: "paper" as const,
  accountId: "PAPER-TEST",
  verifiedPaperAccountId: "PAPER-TEST",
  sessionAuthenticated: true,
  sessionExpiresAt: 2000,
  now: 1000,
  killSwitchEnabled: false,
};

describe("IBKR paper preflight", () => {
  it("accepts independently verified paper sessions", () => {
    expect(validateIbkrPaperPreflight(valid)).toEqual({ allowed: true, accountId: "PAPER-TEST" });
  });
  it.each([
    [{ executionMode: "LIVE" }, "execution_mode_not_paper"],
    [{ verifiedAccountMode: "live" as const }, "account_not_verified_paper"],
    [{ verifiedAccountMode: "unknown" as const }, "account_not_verified_paper"],
    [{ verifiedPaperAccountId: "DIFFERENT" }, "paper_account_identity_mismatch"],
    [{ sessionAuthenticated: false }, "session_unauthenticated"],
    [{ sessionExpiresAt: 1000 }, "session_expired_or_unknown"],
    [{ sessionExpiresAt: undefined }, "session_expired_or_unknown"],
    [{ killSwitchEnabled: true }, "kill_switch_enabled"],
  ])("fails closed for %j", (overrides, reason) => {
    expect(validateIbkrPaperPreflight({ ...valid, ...overrides })).toEqual({ allowed: false, reason });
  });
});

describe("IBKR paper entry validation", () => {
  const entry = {
    quantity: 1, estimatedFillPrice: 90, estimatedCommissionEur: 1,
    quoteToEurRate: 1, maxEntryEur: 100, availableStrategyCashEur: 500,
  };
  it("allows valid fee-inclusive entries", () => {
    expect(validateIbkrPaperEntry(entry)).toEqual({ allowed: true, totalEntryEur: 91 });
  });
  it("rejects exposure exceeding EUR 100 including fees", () => {
    expect(validateIbkrPaperEntry({ ...entry, estimatedFillPrice: 100 })).toEqual({
      allowed: false, reason: "entry_cap_exceeded",
    });
  });
  it("rejects insufficient strategy cash", () => {
    expect(validateIbkrPaperEntry({ ...entry, availableStrategyCashEur: 90 })).toEqual({
      allowed: false, reason: "strategy_cash_exceeded",
    });
  });
  it("rejects missing FX rates and non-finite estimates", () => {
    expect(validateIbkrPaperEntry({ ...entry, quoteToEurRate: NaN })).toEqual({
      allowed: false, reason: "invalid_or_missing_estimate",
    });
  });
});
