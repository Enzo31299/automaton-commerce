# Supplier catalogue analysis and Shopify draft import

This is a separate, opt-in one-shot command. The existing analysis/runtime stays
read-only. It does not crawl AutoDS, use browser cookies, publish products, change
existing products, set saleable inventory, order goods, or process payments.
It runs Catalogue, Margin, Stock and Sourcing as deterministic rules on supplied
evidence. Operator verification flags and URLs are attestations, not independent
proof that a supplier or item is compliant. No demand research is performed.

## Input: supported private data exchange

Obtain a supported supplier export or agreed exchange and normalize it to
`schemaVersion: 1`, `source: "supplier-export"` as in
[the synthetic example](../examples/supplier-catalogue.json). This is our normalized
format, not a claim that AutoDS exports this schema or grants API access. Do not
invent stock, convert costs without evidence, copy unsupported endpoints or mark
unverified flags true. Keep real exports, costs, report and journal outside Git.

Each product requires stable supplier identity/product ID, reviewed plain-text
copy, category, and 1–100 uniquely named variants. Every variant contains a
complete Commerce Product object in shop currency, including costs, shipping,
fees, taxes, returns/advertising reserves, supplier stock and lead time. One
product-level evidence record must cover **all** selected variants, for the exact
destination country, with public HTTPS references for stock, costs, shipping,
returns, traceability, compliance and reviewed content. URLs are saved only in
the private journal/report, never fetched or displayed in the storefront.
Evidence must have an ISO UTC observation timestamp, not be future-dated and be
within the configured 1–24 hour limit. There is no live refresh or FX adapter.

Policy fields are all mandatory: `country`, `maxAgeHours`,
`minContributionCents`, `minMarginBps`, `maxLeadTimeDays`. The example's France,
24 hours, €6 contribution, 25% contribution margin and 17 days are illustrative
thresholds, not verified economics or delivery promises for the current store.
Lead time must include processing; use the same conservative day unit for
supplier input and threshold. Contribution is after explicit reserves and before
unmodelled overhead. Zero costs are accepted only if actually evidenced.

Catalogue validates identity and copy; Margin calculates costs; Stock requires
positive supplier stock above the demand/lead-time/safety reorder point; Sourcing
requires verified traceability/compliance, matching currency and positive
contribution. All variants must pass all thresholds and evidence gates, otherwise
the entire product is rejected. Missing references/invalid structure abort the
batch. At most 100 products, 100 variants each, and 5 MB input are accepted.

## Dry run: no credentials or shop requests

With Node 22 and the repository's pinned pnpm:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec tsc
node dist/commerce/catalogue-import.js /private/supplier-export.json /private/review.json
```

Output report is newly created with mode 0600 (never overwrites an existing
file). Review every report and proposed draft, then retain its `planHash`.
The hash covers all normalized reports, proposals and evidence; time spent
reviewing does not renew evidence. Dry run never imports `AutoDS` automatically.

## Explicit test-store draft import

Use a development store first, a separate private journal database and one
process per store/journal. Reuse and back up the same journal on every attempt;
do not delete it, rotate it or launch copies with another journal to retry.
Stop before changing evidence or recovering an uncertain attempt.

Configure privately `SHOPIFY_SHOP_DOMAIN` to the exact feed domain and one auth
mode (`SHOPIFY_ACCESS_TOKEN` or `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`).
Install a **separate test app** with `read_products`, `write_products`,
`read_inventory`; reinstallation/token permission validation is required.
Do not broaden the currently deployed read-only application's scopes: its
existing token provider intentionally rejects write scopes. The draft-write
provider requires `write_products` and `read_inventory`, rejects other scopes,
and accepts the optional implied `read_products`. A static token has no exchange
scope response; configure only the documented permissions and validate them on
the test store. No permissions or host configuration have been changed here.
See [productSet](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productSet)
and [ProductSetInput](https://shopify.dev/docs/api/admin-graphql/2026-07/input-objects/ProductSetInput).

Set `COMMERCE_ENABLE_DRAFT_WRITES=true` privately only for the reviewed test.
Then use a **new** report path; the hash is not a secret:

```sh
node dist/commerce/catalogue-import.js /private/supplier-export.json /private/apply-report.json --apply-drafts REVIEWED_64_HEX_PLAN_HASH /private/draft-imports.db
```

The command reanalyses evidence, checks the exact plan/store, fully paginates
Shopify SKUs and verifies store currency before creating anything. Existing
SKUs or deterministic handles block creation. The fixed `productSet` mutation
has no product ID or identifier, so it only requests creation, not an upsert.
Every product is explicitly `DRAFT`; inventory is tracked with `DENY` when out
of stock, with **no inventory quantities copied from supplier stock**. There is
no publication operation, collections mutation, media download or AI rewrite.
Titles, escaped reviewed copy, product type, variant names, SKUs and prices are
created. Images, supplier fulfilment mapping, shipping profile, collections,
verified Shopify stock and eventual publication still require separate review.
Draft creation does not establish AutoDS order fulfilment or synchronisation.

Journal persists source-to-Shopify mapping, draft fingerprint and evidence.
An atomic unique pending claim is committed **before** the HTTP mutation. The
response must confirm ID, exact handle, DRAFT, all SKUs/prices, DENY and tracked
inventory before the claim becomes `created`. A repeat of the same confirmed
input skips it; changed confirmed input stops rather than editing it. Crash,
timeout, user error, unexpected response or interrupted confirmation keeps
`pending` and blocks automatic retry. Requests have 15-second timeouts, reject
redirects and never retry automatically. Upstream errors/tokens are not logged.
A batch can create earlier drafts before a later failure; it is not globally
atomic. The operator must inspect Shopify and the journal, record whether the
pending request actually created a product, and recover deliberately. No
automatic reset/reconciliation is provided. Do not treat a pending claim as a
confirmed draft or run this command in a service restart loop.

## Validation status and remaining gates

On 5 October 2026 the lookup/create operations and a synthetic nested draft input
passed Shopify toolkit schema validation for Admin API 2026-07. No API mutation
was executed against a store. Unit/transport tests cover evidence, thresholds,
HTML escaping, identity/currency, duplicate SKU/handle, enable/hash gates,
uncertain writes, repeat imports, claim uniqueness and write-scope separation.
Mocks are not a supplier integration or live Shopify write validation.

Before enabling on the boutique, validate supported supplier data freshness,
all variants and country-specific costs/returns/compliance; test one synthetic
draft on a development store, inspect its options/prices/status/stock behaviour
in Admin, repeat without duplicates, simulate a rejected permission/timeout,
and rehearse manual uncertain-write reconciliation and journal backup/recovery.
Verify exact-commit CI and actual host credentials. AutoDS API access, supplier
mapping, paid orders and automatic publication remain unimplemented/unvalidated.

Local verification on Node 22.16.0 / pnpm 10.28.1: workspace build passed;
full suite passed 1,734 tests in 110.14 seconds, without the 300-second timeout.
Two additional permission rejection cases were then added; all 24 catalogue
import tests passed. Exact-commit GitHub CI remains a separate release gate.
The built dry-run command rejected the unverified synthetic example with
`accepted: 0`, `shopWrites: false`, without Shopify credentials.
