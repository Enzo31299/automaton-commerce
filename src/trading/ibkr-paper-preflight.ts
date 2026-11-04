/**
 * Fail-closed preflight for a future IBKR paper-only broker adapter.
 * Pure validation: does not connect, authenticate, or place orders.
 */
export interface IbkrPaperPreflightInput {
  executionMode: string | undefined;
  verifiedAccountMode: "paper" | "live" | "unknown";
  accountId: string | undefined;
  verifiedPaperAccountId: string | undefined;
  sessionAuthenticated: boolean;
  sessionExpiresAt: number | undefined;
  now: number;
  killSwitchEnabled: boolean;
}

export type IbkrPaperPreflightResult =
  | { allowed: true; accountId: string }
  | { allowed: false; reason: string };

export function validateIbkrPaperPreflight(input: IbkrPaperPreflightInput): IbkrPaperPreflightResult {
  if (input.killSwitchEnabled) return { allowed: false, reason: "kill_switch_enabled" };
  if (input.executionMode !== "IBKR_PAPER") return { allowed: false, reason: "execution_mode_not_paper" };
  if (input.verifiedAccountMode !== "paper") return { allowed: false, reason: "account_not_verified_paper" };
  if (!input.accountId?.trim() || !input.verifiedPaperAccountId?.trim() ||
      input.accountId !== input.verifiedPaperAccountId) {
    return { allowed: false, reason: "paper_account_identity_mismatch" };
  }
  if (!input.sessionAuthenticated) return { allowed: false, reason: "session_unauthenticated" };
  if (!Number.isFinite(input.now) || !Number.isFinite(input.sessionExpiresAt) ||
      input.sessionExpiresAt! <= input.now) {
    return { allowed: false, reason: "session_expired_or_unknown" };
  }
  return { allowed: true, accountId: input.accountId };
}

export interface IbkrPaperEntryInput {
  quantity: number;
  estimatedFillPrice: number;
  estimatedCommissionEur: number;
  quoteToEurRate: number;
  maxEntryEur: number;
  availableStrategyCashEur: number;
}

export type IbkrPaperEntryResult =
  | { allowed: true; totalEntryEur: number }
  | { allowed: false; reason: string };

export function validateIbkrPaperEntry(input: IbkrPaperEntryInput): IbkrPaperEntryResult {
  const values = [
    input.quantity, input.estimatedFillPrice, input.quoteToEurRate,
    input.maxEntryEur, input.availableStrategyCashEur,
  ];
  if (values.some(v => !Number.isFinite(v) || v <= 0) ||
      !Number.isFinite(input.estimatedCommissionEur) || input.estimatedCommissionEur < 0) {
    return { allowed: false, reason: "invalid_or_missing_estimate" };
  }
  const total = input.quantity * input.estimatedFillPrice * input.quoteToEurRate +
    input.estimatedCommissionEur;
  if (!Number.isFinite(total)) return { allowed: false, reason: "invalid_or_missing_estimate" };
  if (total > Math.min(100, input.maxEntryEur)) return { allowed: false, reason: "entry_cap_exceeded" };
  if (total > input.availableStrategyCashEur) return { allowed: false, reason: "strategy_cash_exceeded" };
  return { allowed: true, totalEntryEur: total };
}
