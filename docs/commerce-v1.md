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

Use Node 20 or 22 (the existing CI matrix) and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test --pool=forks
```

Commerce tests cover input validation, safe money arithmetic, margin, stock,
supplier eligibility, SQLite persistence, existing tool execution, policy denial,
profile restrictions, prompts and scheduled reports. Existing tests are retained.
