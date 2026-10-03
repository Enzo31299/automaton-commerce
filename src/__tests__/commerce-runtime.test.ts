import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommerceRuntime } from '../commerce/runtime.js';
import { createDatabase, insertWakeEvent } from '../state/database.js';
import { buildTickContext } from '../heartbeat/tick-context.js';
import { createTestDb, MockConwayClient } from './mocks.js';

const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
const product = { sku: 'RULES', title: 'Local test', category: 'accessories', currency: 'EUR', salePriceCents: 2000,
  supplierCostCents: 500, shippingCostCents: 300, paymentFeeBps: 150, paymentFixedCents: 25,
  taxReserveCents: 200, returnReserveCents: 50, advertisingCostCents: 200, stock: 12,
  dailySales: 2, leadTimeDays: 5, safetyStock: 3 };

it('runs all four agents, policy and memory through the original loop with no wallet or network', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'commerce-runtime-')); dirs.push(dir);
  const path = join(dir, 'state.db');
  const fetch = vi.fn(() => { throw new Error('No network allowed'); }); vi.stubGlobal('fetch', fetch);
  await runCommerceRuntime({ products: [product] }, path, { once: true });
  const db = createDatabase(path);
  try {
    const calls = db.getRecentTurns(20).flatMap(t => t.toolCalls);
    for (const tool of ['commerce_catalogue_list','commerce_margin_analyse','commerce_stock_analyse','commerce_sourcing_analyse','remember_fact','sleep']) {
      expect(calls.some(c => c.name === tool && !c.error)).toBe(true);
    }
    expect(db.raw.prepare('SELECT COUNT(*) AS count FROM policy_decisions').get()).toEqual({ count: 6 });
    expect(db.raw.prepare('SELECT COUNT(*) AS count FROM semantic_memory WHERE key = ?').get('commerce_runtime_mode')).toEqual({ count: 1 });
    expect(db.getKV('health_check_status')).toBe('ok');
    expect(db.getKV('commerce:runtime_last_cycle')).toContain('local-rules');
    expect(db.getKV('last_known_balance')).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(db.getAgentState()).toBe('sleeping');
    expect(db.raw.prepare('SELECT DISTINCT model, cost_cents FROM inference_costs').all()).toEqual([{ model: 'commerce-rules-v1', cost_cents: 0 }]);
  } finally { db.close(); }
}, 20000);

it('persists repeated cycles, wakes from a durable event and shuts down cleanly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'commerce-daemon-')); dirs.push(dir);
  const path = join(dir, 'state.db'); const controller = new AbortController();
  const network = vi.fn(() => { throw new Error('No network allowed'); }); vi.stubGlobal('fetch', network);
  const running = runCommerceRuntime({ products: [product] }, path, { signal: controller.signal });
  const db = createDatabase(path);
  try {
    await vi.waitFor(() => expect(db.getKV('commerce:runtime_last_cycle')).toBeDefined(), { timeout: 5000 });
    insertWakeEvent(db.raw, 'heartbeat', 'Test commerce wake');
    await vi.waitFor(() => expect(db.getTurnCount()).toBeGreaterThanOrEqual(12), { timeout: 5000 });
    controller.abort(); await running;
    expect(db.getAgentState()).toBe('sleeping');
    expect(db.raw.prepare('SELECT COUNT(*) AS count FROM policy_decisions').get()).toEqual({ count: 12 });
    expect(network).not.toHaveBeenCalled();
  } finally { controller.abort(); await running; db.close(); }
}, 15000);

it('builds commerce heartbeat context without fetching credits, while preserving legacy behavior', async () => {
  const db = createTestDb(); const conway = new MockConwayClient();
  const credits = vi.spyOn(conway, 'getCreditsBalance');
  const config = { entries: [], defaultIntervalMs: 60000, lowComputeMultiplier: 4 };
  try {
    const tick = await buildTickContext(db.raw, conway, config, 'ignored-wallet', 'evm', true);
    expect(tick.survivalTier).toBe('normal'); expect(tick.lowComputeMultiplier).toBe(1);
    expect(credits).not.toHaveBeenCalled();
    await buildTickContext(db.raw, conway, config);
    expect(credits).toHaveBeenCalledOnce();
  } finally { db.close(); }
});

it('rejects invalid intervals and incomplete costs before analysing products', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'commerce-invalid-')); dirs.push(dir);
  await expect(runCommerceRuntime({ products: [product] }, join(dir, 'a.db'), { intervalSeconds: 0 })).rejects.toThrow('interval');
  const { shippingCostCents, ...incomplete } = product;
  await expect(runCommerceRuntime({ products: [incomplete] }, join(dir, 'b.db'), { once: true })).rejects.toThrow();
});
