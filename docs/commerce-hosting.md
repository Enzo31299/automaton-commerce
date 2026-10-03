# Hosting preparation — not a live deployment

Commerce needs Node 22 and durable local storage for SQLite. Shopify installation
is an API permission grant; Shopify does not run this repository's Node process.
A Render paid background worker with a persistent disk is a possible host for
the local rules runtime; a Linux VPS is another option. No host is provisioned.

## First hosted test: connected analysis, one invocation

Build the repository with the pinned pnpm version and Node 22:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec tsc
```

Configure secrets in the host's private environment: `SHOPIFY_SHOP_DOMAIN` and
either `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` or `SHOPIFY_ACCESS_TOKEN`.
Do not place secrets in Git, a Docker image, a command argument or a chat message.
Install the app in Shopify first. Client credentials require app and shop in the
same organization; installation by itself does not prove token exchange works.

Mount persistent storage, for example `/var/data`, and place a complete private
supplier evidence file there. Protect its directory and any saved output from
public access. Paths below are examples, not files supplied by this repository.

```sh
node dist/commerce/connected.js /var/data/evidence.json /var/data/commerce.db
```

This command performs one Shopify read and local analysis, then exits. It is not
a worker startup command and must not be placed in an automatic restart loop.
Reports include private costs: restrict log access and retention. A failed auth,
timeout or incomplete input must return a nonzero exit status and leave shop
products, prices, orders and payments untouched. Tests currently mock transport;
run these checks with the real server credentials before accepting deployment.

## Continuous local runtime: separate capability

```sh
node dist/commerce/runtime.js /var/data/batch.json /var/data/commerce.db
```

See [runtime startup](commerce-runtime.md) for the validated batch format and
shutdown behavior. This runs the four agents with policy, memory and heartbeat
on a fixed input. It does not call the connected command or refresh Shopify or
AutoDS. Use one process per SQLite database. A persistent disk is required to
retain state across restarts; keep recoverable, private backups.

## Remaining release gates

* Configure actual host secrets and validate standalone Shopify token exchange,
  catalogue pagination, identity and failure behavior.
* Obtain supported AutoDS API access or validate an agreed data exchange. Its
  browser session and its existing Shopify app do not grant this process access.
* Complete supplier costs, shipping regions, stock and compliance evidence.
* Integrate fresh source reads into the continuous runtime with explicit failure
  handling before describing it as a live autonomous shop agent.
* Verify full CI for the release commit, persisted reports, restart recovery and
  clean shutdown on the actual host. No store writes should occur in this phase.

No paid service or subscription is created by these instructions.
