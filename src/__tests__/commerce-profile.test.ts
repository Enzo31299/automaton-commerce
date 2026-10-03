import { afterEach, expect, it, vi } from 'vitest';
import { selectRuntimeTools, commerceSystemPrompt } from '../commerce/profile.js';
import { commerceCatalogueReview } from '../commerce/heartbeat.js';
import { createBuiltinTools, executeTool } from '../agent/tools.js';
import { buildSystemPrompt, buildWakeupPrompt } from '../agent/system-prompt.js';
import { createTestDb, createTestConfig, createTestIdentity, MockConwayClient, MockInferenceClient, toolCallResponse } from './mocks.js';
import type { AutomatonDatabase, TickContext } from '../types.js';
import { CommerceStore } from '../commerce/store.js';
const dbs: AutomatonDatabase[] = [];
afterEach(() => dbs.splice(0).forEach(db => db.close()));
function context() {
  const db = createTestDb(); dbs.push(db);
  return { db, config: createTestConfig({ runtimeProfile: 'commerce' }), identity: createTestIdentity(), conway: new MockConwayClient(), inference: new MockInferenceClient() };
}
it('filters crypto, replication, shell and installed tools from commerce while preserving legacy', () => {
  const tools = createBuiltinTools('test');
  const selected = selectRuntimeTools(tools, createTestConfig({ runtimeProfile: 'commerce' }));
  expect(selected.filter(t => t.category === 'commerce')).toHaveLength(6);
  for (const name of ['exec', 'topup_credits', 'transfer_credits', 'spawn_child', 'check_usdc_balance', 'fund_child']) expect(selected.some(t => t.name === name)).toBe(false);
  expect(selected.some(t => t.name === 'remember_fact')).toBe(true);
  expect(selectRuntimeTools(tools, createTestConfig())).toBe(tools);
});
it('denies bypass of the profile at the execution boundary', async () => {
  const ctx = context();
  const result = await executeTool('topup_credits', {}, createBuiltinTools('test'), ctx);
  expect(result.error).toBe('Commerce profile denied legacy tool');
});
it('replaces survival system and wake prompts for commerce', () => {
  const ctx = context();
  const financial = { creditsCents: 500, usdcBalance: 5, lastChecked: new Date().toISOString() };
  expect(buildSystemPrompt({ ...ctx, financial, state: 'running', tools: [], isFirstRun: true })).toBe(commerceSystemPrompt(ctx.config.name));
  expect(commerceSystemPrompt(ctx.config.name)).not.toContain('Pay for compute or die');
  expect(buildWakeupPrompt({ ...ctx, financial })).not.toContain('USDC');
});
it('heartbeat persists margin and stock reports and requests a wake for issues', async () => {
  const ctx = context();
  const store = new CommerceStore(ctx.db);
  expect((await commerceCatalogueReview({} as TickContext, ctx)).shouldWake).toBe(false);
  store.upsert({ sku: 'TEST', title: 'Test', category: 'accessories', currency: 'EUR', salePriceCents: 2000,
    supplierCostCents: 500, shippingCostCents: 0, paymentFeeBps: 0, paymentFixedCents: 0,
    taxReserveCents: 0, returnReserveCents: 0, advertisingCostCents: 0, stock: 0,
    dailySales: 1, leadTimeDays: 5, safetyStock: 2 });
  expect((await commerceCatalogueReview({} as TickContext, ctx)).shouldWake).toBe(true);
  expect(ctx.db.raw.prepare('SELECT COUNT(*) AS count FROM commerce_reports').get()).toEqual({ count: 2 });
  expect(JSON.parse(ctx.db.getKV('commerce:last_review')!).alerts).toEqual(['TEST']);
});


it('runs a commerce analysis in the preserved Agent Loop without chain reads or child spawning', async () => {
  const ctx = context();
  const { runAgentLoop } = await import('../agent/loop.js');
  const chain = await import('../conway/x402.js');
  const balance = vi.spyOn(chain, 'getUsdcBalance').mockRejectedValue(new Error('Chain access forbidden'));
  const { Orchestrator } = await import('../orchestration/orchestrator.js');
  const orchestrator = vi.spyOn(Orchestrator.prototype, 'tick');
  const store = new CommerceStore(ctx.db);
  store.upsert({ sku: 'LOOP', title: 'Test', category: 'accessories', currency: 'EUR', salePriceCents: 2000,
    supplierCostCents: 500, shippingCostCents: 0, paymentFeeBps: 0, paymentFixedCents: 0,
    taxReserveCents: 0, returnReserveCents: 0, advertisingCostCents: 0, stock: 10,
    dailySales: 1, leadTimeDays: 5, safetyStock: 2 });
  const inference = new MockInferenceClient([toolCallResponse([{ name: 'commerce_margin_analyse', arguments: { sku: 'LOOP' } }])]);
  const credits = vi.spyOn(ctx.conway, 'getCreditsBalance').mockRejectedValue(new Error('Conway access forbidden'));
  const { ModelRegistry } = await import('../inference/registry.js');
  const registry = new ModelRegistry(ctx.db.raw); registry.initialize();
  const model = registry.get('gpt-5.2')!;
  registry.upsert({ ...model, modelId: 'mock-model', provider: 'other', costPer1kInput: 0, costPer1kOutput: 0 });
  try {
    await runAgentLoop({ ...ctx, config: { ...ctx.config, maxTurnsPerCycle: 1 }, inference });
    expect(ctx.db.getRecentTurns(1)[0].toolCalls[0].error).toBeUndefined();
    expect(store.get('LOOP').sku).toBe('LOOP');
    expect(ctx.db.raw.prepare('SELECT COUNT(*) AS count FROM commerce_reports').get()).toEqual({ count: 1 });
    expect(balance).not.toHaveBeenCalled();
    expect(credits).not.toHaveBeenCalled();
    expect(orchestrator).not.toHaveBeenCalled();
  } finally { vi.restoreAllMocks(); }
});
