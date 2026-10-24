# Automaton Trader — VPS paper deployment

This runbook is intentionally **paper-only**. Do not add exchange credentials or a live execution adapter.

## 1. Prepare the host

```bash
sudo useradd --system --home /opt/automaton-trader --shell /usr/sbin/nologin automaton-trader || true
sudo install -d -o automaton-trader -g automaton-trader -m 0750 /opt/automaton-trader
sudo install -d -o automaton-trader -g automaton-trader -m 0700 /var/lib/automaton-trader
sudo install -d -o root -g automaton-trader -m 0750 /etc/automaton-trader
```

Clone/update the repository in `/opt/automaton-trader`, then explicitly select the Trader branch:

```bash
cd /opt/automaton-trader
git fetch origin automaton-trader
git checkout automaton-trader
git pull --ff-only origin automaton-trader
corepack enable
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
```

Do not deploy from `main`.

## 2. Install the paper environment

```bash
sudo cp ops/paper.env.example /etc/automaton-trader/paper.env
sudo chown root:automaton-trader /etc/automaton-trader/paper.env
sudo chmod 0640 /etc/automaton-trader/paper.env
```

The canonical defaults use EUR-sized paper capital of 150 units, 0.1% simulated fees, 0.05% simulated slippage, a 25% maximum position value, 0.5% risk per trade and 2% daily loss limit. Keep `TRADER_MAX_POSITION_VALUE / TRADER_INITIAL_EQUITY` equal to the OOS allocation fraction or startup will fail closed.

## 3. Run real out-of-sample research

The paper service will not start without recent persisted research. Run the research command as the service user so the same durable SQLite database is used:

```bash
cd /opt/automaton-trader
sudo -u automaton-trader env TRADER_DB_PATH=/var/lib/automaton-trader/state.db pnpm trader:research
```

The command downloads public historical market data for BTC-USD, ETH-USD and SOL-USD, runs the configured walk-forward/OOS policy, and persists the result. Inspect the JSON output. Do not manually edit the stored eligibility result.

The service requires the selected `momentum-20-2` strategy to be eligible on **all three** required markets. A missing, stale, malformed or incompatible research record prevents startup.

## 4. Install systemd service

```bash
sudo cp ops/automaton-trader-paper.service /etc/systemd/system/automaton-trader-paper.service
sudo systemctl daemon-reload
sudo systemctl enable automaton-trader-paper.service
sudo systemctl start automaton-trader-paper.service
```

Inspect startup and recent logs:

```bash
sudo systemctl status automaton-trader-paper.service --no-pager
sudo journalctl -u automaton-trader-paper.service -n 100 --no-pager
```

Expected startup event contains `"event":"paper_service_started"` and `"mode":"paper"`. If the OOS gate rejects the strategy, leave the service stopped; do not bypass the gate.

## 5. Health verification

```bash
cd /opt/automaton-trader
sudo -u automaton-trader env TRADER_DB_PATH=/var/lib/automaton-trader/state.db pnpm trader:health:built
```

A non-zero exit is unhealthy. The service also exits after the configured number of consecutive total-market outages so systemd can restart it.

## 6. Paper-only acceptance checklist

- Branch is exactly `automaton-trader`.
- Typecheck, tests and build pass on the deployed commit.
- OOS research is recent and persisted in the production paper database.
- BTC-USD, ETH-USD and SOL-USD all clear the persisted research gate.
- Service starts with `mode=paper` and no exchange credentials are configured.
- Health check passes after successful market cycles.
- SQLite state survives a controlled service restart without duplicate candle processing.
- A controlled stop/start produces no real exchange order because the runtime uses only the paper execution adapter.

Only after every item passes should this build be considered ready for continuous VPS **paper trading**. This runbook does not authorize or configure real-money trading.
