# IBKR paper integration — deployment gate (2026-11-04)

## Verified repository baseline
- Branch: `automaton-trader`.
- `src/trading/paper-service-entrypoint.ts` uses Coinbase market data and an internal paper execution runtime, not IBKR.
- `src/trading/execution.ts` defines `ExecutionAdapter` and `PaperExecutionAdapter`; no IBKR order routing is established by these files.
- `src/trading/risk-engine.ts` checks symbols, open-position count, daily loss, position value including estimated fee, and stop-loss risk.
- Existing paper service refuses startup unless persisted out-of-sample research clears its gate.

## Non-negotiable controls
1. Default to DISABLED; never route orders to a live account.
2. IBKR paper account identity must be independently verified through the broker's supported gateway/API, not inferred from the ChatGPT account connector.
3. Require explicit environment flag `TRADER_EXECUTION_MODE=IBKR_PAPER` plus an independently verified paper account identifier. Reject any other account.
4. Maintain a hard max entry exposure of EUR 100 **including estimated commissions**, and a EUR 500 *simulated strategy budget*. These do not represent actual broker balances.
5. Read-only connection smoke test first; then dry-run intent validation; only then paper order submission after verification.
6. Keep existing strategy research gate and risk checks, and fail closed on missing data, stale quotes, disconnections, mismatched currency, partial fills, or uncertain order state.
7. Add idempotent order IDs, reconciliation after restart, audit logs, a kill switch, and explicit test coverage before enabling unattended execution.
8. No credential, session token, account identifier or personal data committed to Git.

## Implementation sequence
- Define a broker-neutral interface for balances, positions, quotes, orders, and execution reports.
- Add IBKR paper-only adapter with strict account-mode validation and no live fallback.
- Add mocked tests for rejection of live accounts, missing/expired sessions, duplicate orders, EUR conversion, fee-inclusive cap, and restart reconciliation.
- Document Gateway/TWS deployment, network/authentication, session expiry and manual recovery on VPS.
- Run typecheck and test suite in CI; collect verified read-only smoke-test evidence from the VPS before any paper orders.

## Current verification limits
ChatGPT's IBKR connector returned account summary and positions, but this does **not** establish VPS-to-IBKR API access or access to an IBKR paper account. No VPS deployment or paper trade has been performed in this change.
