# Commerce connections and test deployment

## Shopify: implemented read-only connector

Build with Node 22 and `pnpm exec tsc`. Supply secrets through the host's secret
manager/environment, never committed JSON or chat:

* `SHOPIFY_SHOP_DOMAIN`: exact lowercase `name.myshopify.com`, no scheme/path.
* `SHOPIFY_ACCESS_TOKEN`: Admin API token for that shop with `read_products`.

The connector pins Admin GraphQL API `2026-07` and exposes only one fixed query,
no mutations. It rejects redirects, mismatched store identity, GraphQL errors,
duplicate IDs, repeated cursors and unsupported store currencies (V1: EUR/USD).
Each request times out after 15 seconds. It follows variant pagination up to
100 pages of 50 variants; hitting the limit fails rather than returning a
supposedly complete catalogue. There are no automatic retries or write requests.
See [Shopify productVariants documentation](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/productVariants).

Create a private `evidence.json` with `assumptionsByVariantId` mapping exact
Shopify variant GIDs to complete Product objects as in
`examples/commerce-product.json`. The connector obtains SKU, price and product
title from Shopify; all costs, category, demand, lead times and supplier stock
remain explicit. A missing SKU or currency mismatch fails. Do not substitute
Shopify inventory for supplier stock. Add `offersBySku` using the documented
SupplierOffer format and `mineaBySku` using the selection evidence format.
Neither map is live data: keep source evidence, variant correspondence,
conversion evidence and observation timestamps with the private input.

```sh
node dist/commerce/connected.js evidence.json ./commerce-test.db
```

This reads Shopify, evaluates only variants named in the evidence file, runs the
four agents and selection, and atomically saves local drafts/reports. Output
identifies AutoDS and Minea as `supplied-evidence`. No prices, products, stock,
orders or payments are changed. Reports contain sensitive costs; store privately.
This is a one-shot analysis, not a scheduled autonomous runtime. No token or
cookie is copied from browser login. The ChatGPT Shopify connector's credentials
are not available to this process.

## AutoDS: live adapter blocked pending supported access

AutoDS documents its MCP connector at
[AutoDS MCP documentation](https://help.autods.com/en/articles/15505185-autods-claude-mcp-connector-connect-claude-to-your-autods-account-search-products-and-manage-your-store).
On 3 October 2026 that documentation explicitly supports Claude only, excluding
Codex/ChatGPT and other assistants. Do not claim this fork can use it merely
because it speaks MCP. AutoDS also advertises API integrations at
[AutoDS API](https://www.autods.com/api/); a supported account-specific API
contract and credentials must be established before implementing live requests.
No private platform endpoints, staging APIs or browser cookies are used.
Until then, explicit supplier offers can be supplied offline, but this is not
an AutoDS live integration or validation of supplier stock/compliance.

## Minea: account entitlement blocks live MCP

The authenticated account's MCP page on 3 October 2026 displayed that Premium
or Business is required. No upgrade, subscription or API credential was created.
The selection agent accepts dated observations, but its supplier eligibility
and exact product correspondence checks are still required. Advertising
activity does not establish sales or profitable demand. Browser access to
Minea is not a runtime integration.

## Validation and release gates

On 3 October 2026 the catalogue query passed Shopify schema validation for
`2026-07` (`read_products`) and executed against the connected shop, returning
10 variant samples in EUR with further pages available. This verifies the
query via the connector, not the standalone HTTP transport, its token or full
catalogue completeness. Automated tests mock HTTP transport and cover pagination,
identity, domain restrictions, errors, duplicate IDs and evidence binding.

Before declaring deployment ready, verify the standalone command on a Shopify
development store with a real read-only token, compare every variant across
pagination, inspect local persisted reports, and confirm the store has no
changes. Exercise an invalid token, timeout and missing costs: all must fail.
Establish supported AutoDS access, implement its adapter or a documented,
validated data exchange, and validate it in test mode. Minea is optional product
research; Claude is not required to deploy Commerce V1. Leaving either service
unconfigured must not be interpreted as validated evidence or a product match.
The autonomous local rules startup is documented in [commerce-runtime.md](commerce-runtime.md).
Validate the full CI suite without timeout for the exact release commit. Live
shop and supplier validation and the hosted deployment remain
release blockers; this document does not mark any of them complete.

## Deployment work resumed — 4 October 2026 (Europe/Paris)

Development has resumed with Shopify and AutoDS as the required integrations.
Claude and Minea are deferred. The earlier pause in `reprise-2026-10-03.md` is
historical; its remaining technical blockers still apply until verified.

The supplied spreadsheet contains 39 variant mappings across three products.
Matching those IDs and SKUs to the supplied text is an input consistency check,
not a fresh Shopify/AutoDS read. It contains no complete landed costs or verified
delivery/stock/compliance evidence. Keep this private input outside the public
repository, and do not turn missing costs into zero or mark the suppliers verified.

Deployment still needs a host with persistent SQLite storage and Node 22, a
read-only Shopify token configured in that host's secret manager, and supported
AutoDS credentials or an agreed data exchange. Browser and ChatGPT connector
sessions do not supply runtime credentials. No host has been provisioned, no
secret has been committed, and no boutique deployment has been performed.

The wallet-free Agent Loop/Policy/Memory/Heartbeat entrypoint now exists as a
local fixed-rules runtime; it does not refresh Shopify or AutoDS automatically.

The context token counter now bypasses exact BPE encoding for text longer than
4096 UTF-16 code units, using the UTF-8 byte count as a conservative upper bound.
This avoids blocking on long repeated input and excludes that input from the
token cache. Large histories can therefore be compressed sooner; this changes
budget precision, not the stored history or commerce product data. Small inputs
continue to use the existing tokenizer.
