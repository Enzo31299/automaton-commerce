import { afterEach, describe, expect, it } from 'vitest';
import { catalogueAgent, marginAgent, stockAgent, sourcingAgent, type Product } from '../commerce/agents.js';
import { CommerceStore } from '../commerce/store.js';
import { createBuiltinTools, executeTool } from '../agent/tools.js';
import { PolicyEngine } from '../agent/policy-engine.js';
import { createTestDb, createTestIdentity, createTestConfig, MockConwayClient, MockInferenceClient } from './mocks.js';
import type { AutomatonDatabase, ToolContext } from '../types.js';

const product: Product = { sku: 'ROLLER-1', title: 'Ice roller', category: 'accessories', currency: 'EUR',
  salePriceCents: 2000, supplierCostCents: 500, shippingCostCents: 300, paymentFeeBps: 150,
  paymentFixedCents: 25, taxReserveCents: 200, returnReserveCents: 50, advertisingCostCents: 200,
  stock: 12, dailySales: 2, leadTimeDays: 5, safetyStock: 3 };
const offer = { supplier: 'Supplier A', currency: 'EUR', unitCostCents: 450, shippingCostCents: 300,
  stock: 10, leadTimeDays: 5, traceabilityVerified: true, complianceVerified: true };
const dbs: AutomatonDatabase[] = [];
afterEach(() => dbs.splice(0).forEach(db => db.close()));
function database() { const db = createTestDb(); dbs.push(db); return db; }

describe('Commerce agents', () => {
  it('calculates contribution after all explicit costs', () => {
    expect(marginAgent(product)).toMatchObject({ paymentFeeCents: 55, totalCostCents: 1305, contributionCents: 695, marginBps: 3475, profitable: true });
    expect(marginAgent({ ...product, salePriceCents: 0 })).toMatchObject({ profitable: false, marginBps: null });
    expect(marginAgent({ ...product, salePriceCents: 1001 })).toMatchObject({ paymentFeeCents: 41 });
  });
  it.each([NaN, Infinity, -1, 1.1, '500', undefined, Number.MAX_SAFE_INTEGER + 1])('rejects invalid money %s', value => {
    expect(() => catalogueAgent({ ...product, supplierCostCents: value })).toThrow();
  });
  it('requires identity, currency and valid fee rate', () => {
    for (const patch of [{ sku: '' }, { currency: 'eur' }, { paymentFeeBps: 10001 }]) expect(() => catalogueAgent({ ...product, ...patch })).toThrow();
  });
  it('detects replenishment and handles zero demand', () => {
    expect(stockAgent(product)).toMatchObject({ status: 'reorder', reorderPoint: 13, suggestedOrderQuantity: 1 });
    expect(stockAgent({ ...product, stock: 0 })).toMatchObject({ status: 'out_of_stock' });
    expect(stockAgent({ ...product, dailySales: 0 })).toMatchObject({ status: 'healthy', daysOfCover: null });
    expect(stockAgent({ ...product, stock: 13 })).toMatchObject({ status: 'reorder', suggestedOrderQuantity: 0 });
  });
  it('rejects unsafe stock and money arithmetic', () => {
    expect(() => stockAgent({ ...product, dailySales: Number.MAX_VALUE })).toThrow();
    expect(() => marginAgent({ ...product, supplierCostCents: Number.MAX_SAFE_INTEGER })).toThrow();
  });
  it('ranks only profitable, documented, available offers in the same currency', () => {
    const report = sourcingAgent(product, [offer,
      { ...offer, supplier: 'Cheaper', unitCostCents: 1, complianceVerified: false },
      { ...offer, supplier: 'Wrong currency', currency: 'USD' },
      { ...offer, supplier: 'Unavailable', stock: 0 },
      { ...offer, supplier: 'Expensive', unitCostCents: 2500 }]);
    expect(report.recommended?.supplier).toBe('Supplier A');
    expect(report.offers.filter(o => o.eligible)).toHaveLength(1);
    expect(sourcingAgent(product, []).recommended).toBeNull();
    expect(() => sourcingAgent(product, [{ ...offer, complianceVerified: 'true' }])).toThrow();
  });
  it('persists products and reports without modifying core tables', () => {
    const db = database();
    const store = new CommerceStore(db);
    store.upsert(product);
    store.upsert({ ...product, stock: 4 });
    expect(new CommerceStore(db).get(product.sku).stock).toBe(4);
    expect(store.list()).toHaveLength(1);
    store.report('stock', product.sku, stockAgent(store.get(product.sku)));
    expect(db.raw.prepare('SELECT COUNT(*) AS count FROM commerce_reports').get()).toEqual({ count: 1 });
    expect(db.getTurnCount()).toBe(0);
    expect(() => store.get('missing')).toThrow('Unknown SKU');
    expect(() => store.upsert({ ...product, stock: -1 })).toThrow();
    expect(store.get(product.sku).stock).toBe(4);
  });
  it('exposes tools through the existing executor and respects policy denial', async () => {
    const db = database();
    const ctx: ToolContext = { db, identity: createTestIdentity(), config: createTestConfig(), conway: new MockConwayClient(), inference: new MockInferenceClient() };
    const tools = createBuiltinTools('test');
    expect(tools.filter(t => t.category === 'commerce')).toHaveLength(5);
    const policy = new PolicyEngine(db.raw, [{ id: 'deny-commerce', description: 'test', priority: 1, appliesTo: { by: 'category', categories: ['commerce'] }, evaluate: () => ({ rule: 'deny-commerce', action: 'deny', reasonCode: 'TEST', humanMessage: 'Denied' }) }]);
    const denied = await executeTool('commerce_catalogue_upsert', { product }, tools, ctx, policy, { inputSource: 'creator', turnToolCallCount: 0, sessionSpend: {} as never });
    expect(denied.error).toContain('Policy denied');
    expect(db.raw.prepare("SELECT name FROM sqlite_master WHERE name='commerce_products'").get()).toBeUndefined();
    const saved = await executeTool('commerce_catalogue_upsert', { product }, tools, ctx);
    expect(saved.error).toBeUndefined();
    const report = await executeTool('commerce_margin_analyse', { sku: product.sku }, tools, ctx);
    expect(report.error).toBeUndefined();
    expect(JSON.parse(report.result).contributionCents).toBe(695);
    const invalid = await executeTool('commerce_stock_analyse', { sku: 'missing' }, tools, ctx);
    expect(invalid.error).toContain('Unknown SKU');
  });
});
