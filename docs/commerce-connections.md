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
Establish supported AutoDS access and Minea entitlement, implement their adapters,
and validate each in test mode. Complete autonomous wallet-free Agent Loop,
Memory/Policy/Heartbeat startup and the full CI suite without timeout. These are
release blockers; this document does not mark any of them complete.
