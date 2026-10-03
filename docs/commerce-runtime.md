# Commerce runtime: local rules, no wallet

The wallet-free entrypoint reuses the existing Agent Loop, Policy Engine,
SQLite, memory ingestion and durable Heartbeat. Its planner is a fixed sequence
of commerce checks, not an LLM. It requires no Claude, Minea, Conway account or
model API key. No wallet is generated, no chain balance is queried, and all
Conway operations are disabled. The commerce profile uses an explicit registered
model/planner and never selects one according to Conway credits.

## Test startup

Use Node 22, install dependencies with the pinned pnpm version, and compile:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc
node dist/commerce/runtime.js examples/commerce-runtime-batch.json ./commerce-test.db --once
```

The example is synthetic test data. Never treat its supplier costs, stock or
verification flags as evidence for a real shop. The command imports validated
local drafts and reports, then performs Catalogue, Margin, Stock and Sourcing
through the original tool executor. Every call passes Policy Engine with the
database-backed SpendTracker. The cycle stores a semantic memory and sleeps.
Failures or an incomplete tool sequence prevent the completed-cycle marker.

Check `commerce_products`, `commerce_reports`, `turns`, `policy_decisions`,
`semantic_memory`, and `inference_costs` in the private SQLite database. The KV
key `commerce:runtime_last_cycle` records completion and `shopWrites: false`.
The planner is recorded as `commerce-rules-v1` with zero inference cost; no
external inference request is made. The CLI exits nonzero on failure and avoids
printing private input in its final error message; detailed process logs and
the database contain product information and must be kept private.

## Continuous operation

```sh
node dist/commerce/runtime.js ./private-batch.json ./persistent/commerce.db
```

The default interval is one hour. The durable scheduler checks local database
health every five minutes and reviews margin/stock hourly. Its wake events can
start a new agent cycle before the normal interval. SIGINT/SIGTERM finishes the
current cycle, stops and drains the Heartbeat, and closes SQLite. A host should
allow sufficient shutdown time for its catalogue size and supervise the process.
The programmatic entrypoint permits intervals from 60 to 86400 seconds and an
AbortSignal. A runtime input accepts 1 to 100 fully costed products.

The input is read at startup. Repeated cycles reuse supplied costs, offers and
local drafts; this is not automatic Shopify or supplier refresh. Restart with
a reviewed new input when the source evidence changes. Do not share a database
between concurrent runtimes. Persist and back up its directory on the host;
use private file permissions, and never commit real input or databases.

## Deployment status

This is a usable autonomous local rules runtime, not a validated live shop
integration. Shopify's read-only one-shot command remains documented in
`commerce-connections.md`. A production host and runtime Shopify credentials
are still required. AutoDS access/data exchange, complete costs and delivery,
supplier stock and compliance evidence must still be validated in test mode.
No store products, prices, inventory, orders or payments are written by this
entrypoint. No hosted deployment has been performed.

Regression coverage exercises a complete cycle with network access forbidden,
the six policy decisions, persisted memory, the registered zero-cost planner,
durable wake and repeated cycles, graceful shutdown, missing costs and invalid
intervals. The full suite and CI must pass for the exact release commit.
