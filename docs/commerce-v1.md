# Automaton Commerce V1 — first migration increment

The Conway Agent Loop, Policy Engine, SQLite database, durable Heartbeat and
Memory remain in place. Existing configuration retains legacy behavior.
Set `"runtimeProfile": "commerce"` in your existing configuration to opt in.
This is an analysis and local-draft release, not a connected shop operator.

## Agents and tools

| Agent | Tool | Result |
| --- | --- | --- |
| Catalogue | `commerce_catalogue_upsert` | Validated local product draft |
| Catalogue | `commerce_catalogue_list` | Saved drafts |
| Margin | `commerce_margin_analyse` | Contribution after explicit costs |
| Stock | `commerce_stock_analyse` | Reorder point and stock coverage |
| Sourcing | `commerce_sourcing_analyse` | Eligible offers ranked by contribution then lead time |
| Selection | `commerce_selection_analyse` | Recommendations combining costs, supplier eligibility and dated Minea evidence |

Selection accepts `candidates` (maximum 100), each with a complete `product`,
`offers` and optional `minea`: `{sku, sourceUrl, observedAt,
productMatchVerified, activeDays}`. The source must be an HTTPS `app.minea.com`
URL without credentials, query or fragment. Timestamp must be UTC ISO format.
Missing evidence, an unverified SKU/product match, observations older than seven
days or in the future, no active ad signal, a nonpositive current contribution or
no eligible supplier excludes the candidate. Eligible candidates sort by current
contribution, then ad activity duration, then SKU. These are simple review
priorities, not predictions of revenue or profit. No live Minea fetching is built
into this tool; it uses supplied observations and records selection reports in
SQLite through the existing policy-controlled tool executor.

On 3 October, authenticated Minea access showed a KLIP hair-clip advertisement
active for 15 days. This is a category research lead only: it has not been
verified as the same product as any Shopify SKU or AutoDS offer. Advertiser-wide
ad counts must not be treated as product sales, and Minea signals never substitute
for supplier traceability, compliance, stock or complete costs. No shop changes
were made from this observation.

Upsert accepts `{ "product": ... }` using the product in
`examples/commerce-product.json`. Analysis tools accept `{ "sku": "ROLLER-1" }`.
Sourcing also requires `offers`, an array of at most 100 objects with:
`supplier`, `currency`, `unitCostCents`, `shippingCostCents`, `stock`,
`leadTimeDays`, `traceabilityVerified` and `complianceVerified`.

All costs are explicit nonnegative integer minor currency units. Fee rates are
basis points (150 = 1.5%). Daily sales may be fractional. Currency must be a
three-letter uppercase code; no FX conversion is inferred. Payment percentage
fees round up to the next minor unit. Contribution subtracts supplier cost,
shipping, payment fees, tax reserve, returns reserve and advertising estimate.
It is not net profit: omitted fixed costs and inaccurate inputs affect the result.
Tax reserves are operator inputs, not a tax calculation.

Reorder point = ceil(daily sales × lead time days) + safety stock. Suggested
quantity only fills that point; there is no automatic purchasing or MOQ model.
Supplier verification flags reflect operator-supplied evidence. Unknown
verification must be false. Missing stock, non-positive contribution, currency
mismatch or absent verification excludes an offer. No supplier is contacted.

## Persistence and scheduling

### Wallet-free local analysis startup

Use Node 22 and install dependencies with the pinned pnpm version. Build the root
package with `pnpm exec tsc`. Create `batch.json` containing
`{"products": [<complete product from examples/commerce-product.json>],
"offersBySku": {"ROLLER-1": []}}`, replacing the placeholder with the JSON object.
Then run:

```sh
node dist/commerce/run.js batch.json ./commerce-state.db
```

This entrypoint validates the complete batch, runs Catalogue, Margin, Stock and
Sourcing, and atomically persists drafts and three analysis reports per SKU in
the existing SQLite schema. It prints a JSON report and exits. Errors exit with
code 1; duplicate SKUs, invalid products and offers for unknown SKUs fail before
draft writes. Missing supplier offers produce no sourcing recommendation.
Use a dedicated database file for evaluation; repeated runs upsert drafts and
append reports. Inputs and reports can contain business-sensitive costs: keep
them private and out of Git.

It imports no wallet/provisioning path and makes no network or shop calls. It is
a deterministic batch runner, not the autonomous Agent Loop. Existing Policy
Engine, Memory and durable Heartbeat are preserved in the main runtime; this
runner does not start them or expose tool execution. Full autonomous commerce
startup and live connector integration remain pending.

`commerce_products` and `commerce_reports` are additive namespaced tables in the
existing database. They do not replace upstream schemas or memory. Analyses
store immutable report snapshots. Catalogue drafts are upserted by SKU.

Add this entry to the existing heartbeat configuration:

```yaml
- name: commerce_catalogue_review
  schedule: "*/30 * * * *"
  task: commerce_catalogue_review
  enabled: true
```

The durable scheduler retains leases, timeouts, retry history and wake events.
The review persists margin and stock reports and requests a wake for affected
SKUs. It uses stored snapshots; live stock refresh remains a future integration.

## Progressive removal

In the commerce profile, tool selection and the execution boundary enforce an
explicit allowlist. Crypto, credit transfers, replication, shell execution,
self-modification and unknown installed tools are unavailable. The commerce
system and wake prompts replace wallet and survival instructions. Agent Loop
orchestration that could spawn funded children is disabled; inline USDC top-up
and chain balance reads are disabled. Heartbeat only exposes commerce review
and the existing runtime health check, and does not read chain balances.

Legacy modules and tests remain for compatibility during migration. Provider
compute-credit checks, inference budget tiers, wallet-shaped identity types and
upstream startup/provisioning still exist. The full executable is **not yet
wallet-free**. Do not launch the legacy CLI expecting a complete crypto removal.
Next increments: independent commerce startup/identity, provider-neutral compute
budget, shop/supplier adapters and removal of unused legacy dependencies after
replacement tests pass. Store publication, price changes and supplier orders
need explicit policy-controlled integrations.

## Validation

### Connected-account inspection — 3 October 2026

Read-only inspection succeeded through the Shopify connector and an authenticated
AutoDS browser session for the same store. Shopify returned 29 products; only
the first 10 products and the connector's limited variant samples were inspected.
AutoDS displayed 28 tracked products plus 1 untracked product. This is account
access evidence, not deployment validation or a complete product reconciliation.
Several AutoDS buy prices were USD while sell prices were EUR. Its available
variation counts are not stock quantities. Shopify inventory is not evidence of
supplier availability. No products, orders, payments or supplier settings changed.

`src/commerce/import.ts` provides an offline variant import boundary for tests.
It takes `{id, sku, price}` from Shopify and a complete explicit Product input
with supplier stock, operating costs, category, currency and demand assumptions.
It overrides SKU and sale price from the variant and validates the result.
Money strings must have at most two decimal places; this V1 contract supports
only two-decimal amounts. Choose the currency from the verified store response.
Never pass USD supplier costs into an EUR product without a separately verified
conversion and its source/date. Missing inputs fail; no zero-cost defaults or
Shopify inventory substitution are made. This module performs no network calls,
database writes or shop changes and is not yet wired into the Agent Loop.

Test this boundary with `pnpm exec vitest run src/__tests__/commerce-import.test.ts
--pool=forks`. Live Shopify API credentials, a documented supported AutoDS
data interface, complete variant pagination and end-to-end dry-run integration
still need validation before deployment. Browser login does not provide runtime
credentials for a deployed process; do not copy browser cookies into the agent.

Use Node 20 or 22 (the existing CI matrix) and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test --pool=forks
```

Commerce tests cover input validation, safe money arithmetic, margin, stock,
supplier eligibility, SQLite persistence, existing tool execution, policy denial,
profile restrictions, prompts and scheduled reports. Existing tests are retained.
