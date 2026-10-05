import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyseSupplierCatalogue } from '../commerce/supplier-catalogue.js';
import { CREATE_DRAFT, DraftJournal, importSupplierDrafts } from '../commerce/draft-writer.js';
import { shopifyTokenProvider } from '../commerce/shopify-auth.js';

const now = Date.parse('2026-10-05T08:00:00Z');
const product = { sku: 'NEW-1', title: 'Brosse', category: 'Coiffure', currency: 'EUR', salePriceCents: 2000,
 supplierCostCents: 400, shippingCostCents: 200, paymentFeeBps: 150, paymentFixedCents: 25, taxReserveCents: 200,
 returnReserveCents: 50, advertisingCostCents: 200, stock: 20, dailySales: 1, leadTimeDays: 10, safetyStock: 3 };
function feed() { return { schemaVersion: 1, source: 'supplier-export', domain: 'test.myshopify.com', currency: 'EUR',
 policy: { country: 'FR', maxAgeHours: 24, minContributionCents: 600, minMarginBps: 2500, maxLeadTimeDays: 17 },
 products: [{supplier: 'Example', supplierProductId: '123', title: 'Brosse', category: 'Coiffure', description: 'Simple <script>text</script>',
 evidence: { observedAt: '2026-10-05T07:00:00Z', country: 'FR', costsVerified: true, shippingVerified: true, returnsVerified: true,
 traceabilityVerified: true, complianceVerified: true, contentReviewed: true,
 references: Object.fromEntries(['stock','costs','shipping','returns','traceability','compliance','content'].map(k => [k, 'https://example.com/evidence'])) },
 variants: [{ name: 'Rose', product: { ...product } }] }] }; }
const journals: DraftJournal[] = [];
afterEach(() => journals.splice(0).forEach(j => j.close()));
function journal() { const j = new DraftJournal(':memory:'); journals.push(j); return j; }
function response(data: unknown) { return new Response(JSON.stringify({ data })); }
function transport(f = feed(), failure = '') {
 const calls: any[] = []; const input = analyseSupplierCatalogue(f, now).proposals[0]?.input;
 const request = async (_url: any, options: any) => {
  const call = JSON.parse(options.body); calls.push(call);
  if (call.query.includes('CommerceDraftLookup')) expect(call.variables.query).toContain('status:active,draft,archived,unlisted');
  expect(options.redirect).toBe('error'); expect(options.signal).toBeInstanceOf(AbortSignal);
  if (call.query.includes('CommerceCatalogue')) return response({ shop: { myshopifyDomain: f.domain, currencyCode: failure === 'currency' ? 'USD' : 'EUR' },
   productVariants: { nodes: failure === 'duplicate' ? [{id:'gid://shopify/ProductVariant/1',sku:'NEW-1',price:'20.00',inventoryQuantity:10,product:{id:'gid://shopify/Product/1',title:'Existing',productType:'Coiffure'}}] : [], pageInfo: {hasNextPage:false,endCursor:null} } });
  if (call.query.includes('CommerceDraftLookup')) return response({shop: {myshopifyDomain: failure === 'identity' ? 'other.myshopify.com' : f.domain,currencyCode:'EUR'}, products: { nodes: failure === 'handle' ? [{id:'gid://shopify/Product/1',handle:input?.handle}] : [] } });
  if (failure === 'timeout') throw new Error('private-token upstream failure');
  return response({productSet: { userErrors: failure === 'userErrors' ? [{message:'private upstream'}] : [], product: {
   id:'gid://shopify/Product/2', handle:input?.handle, status:failure === 'active' ? 'ACTIVE' : 'DRAFT',
   variants: {nodes: input?.variants.map(v => ({sku:v.sku,price:v.price,inventoryPolicy: failure === 'continue' ? 'CONTINUE' : 'DENY', inventoryItem:{tracked:true}})),pageInfo:{hasNextPage:false}}
  } } });
 };
 return {calls,request:request as typeof fetch};
}
function options(f = feed(), j = journal(), failure = '') { const t = transport(f,failure); return {t, o:{domain:f.domain,approvedPlanHash:analyseSupplierCatalogue(f,now).planHash,enabled:true,journal:j,getToken:async()=> 'secret',request:t.request,now:()=>now}}; }

describe('Supplier catalogue and isolated draft import', () => {
 it('runs all four agent reports and builds escaped draft variants without supplier inventory writes', () => {
  const p = analyseSupplierCatalogue(feed(),now); expect(p.proposals).toHaveLength(1);
  expect(p.proposals[0].input.descriptionHtml).not.toContain('<script>'); expect(p.proposals[0].input.status).toBe('DRAFT');
  expect(p.proposals[0].input.variants[0]).toMatchObject({price:'20.00',inventoryPolicy:'DENY',inventoryItem:{tracked:true}});
  expect(JSON.stringify(p.proposals[0].input)).not.toContain('inventoryQuantities');
  expect((p.reports[0] as any).variants[0]).toHaveProperty('sourcing');
 });
 it.each(['costsVerified','shippingVerified','returnsVerified','traceabilityVerified','complianceVerified','contentReviewed'])('blocks missing %s', flag => {
  const f=feed(); (f.products[0].evidence as any)[flag]=false; expect(analyseSupplierCatalogue(f,now).proposals).toHaveLength(0);
 });
 it('blocks stale/future evidence, wrong destination, weak margin and exhausted stock', () => {
  for (const patch of [{observedAt:'2026-10-03T07:00:00Z'},{observedAt:'2026-10-06T07:00:00Z'},{country:'US'}]) {
   const f=feed(); Object.assign(f.products[0].evidence,patch); expect(analyseSupplierCatalogue(f,now).proposals).toHaveLength(0);
  }
  for (const patch of [{stock:0},{stock:13},{salePriceCents:1000},{leadTimeDays:18}]) {
   const f=feed(); f.products[0].variants[0].product={...product,...patch}; expect(analyseSupplierCatalogue(f,now).proposals).toHaveLength(0);
  }
 });
 it('rejects malformed costs, currency and duplicate SKU before any network', () => {
  const f=feed(); (f.products[0].variants[0].product as any).supplierCostCents=undefined; expect(()=>analyseSupplierCatalogue(f,now)).toThrow();
  const g=feed();g.products[0].variants.push({name:'Bleu',product});expect(()=>analyseSupplierCatalogue(g,now)).toThrow('Duplicate SKU');
  const h=feed();h.currency='USD';expect(()=>analyseSupplierCatalogue(h,now)).toThrow('currency');
 });
 it('requires both enable switch and exact reviewed plan', async () => {
  const {t,o}=options();await expect(importSupplierDrafts(feed(),{...o,enabled:false})).rejects.toThrow('disabled');
  await expect(importSupplierDrafts(feed(),{...o,approvedPlanHash:'0'.repeat(64)})).rejects.toThrow('changed'); expect(t.calls).toHaveLength(0);
 });
 it.each(['currency','identity','duplicate','handle'])('blocks %s before mutation', async failure => {
  const {t,o}=options(feed(),journal(),failure); await expect(importSupplierDrafts(feed(),o)).rejects.toThrow();
  expect(t.calls.some(c=>c.query===CREATE_DRAFT)).toBe(false);
 });
 it('creates only a draft, persists mapping, and avoids another write on repeat', async () => {
  const {t,o}=options(); const result=await importSupplierDrafts(feed(),o); expect(result[0]).toMatchObject({id:'gid://shopify/Product/2',skipped:false});
  expect((await importSupplierDrafts(feed(),o))[0].skipped).toBe(true);
  const writes=t.calls.filter(c=>c.query===CREATE_DRAFT);expect(writes).toHaveLength(1);
  expect(writes[0].variables.input).not.toHaveProperty('id');expect(writes[0].variables).not.toHaveProperty('identifier');
 });
 it.each(['timeout','userErrors','active','continue'])('retains uncertain claim and never retries %s', async failure => {
  const j=journal(); const {t,o}=options(feed(),j,failure); await expect(importSupplierDrafts(feed(),o)).rejects.toThrow();
  expect(j.get(feed().domain,analyseSupplierCatalogue(feed(),now).proposals[0].sourceKey)?.state).toBe('pending');
  await expect(importSupplierDrafts(feed(),o)).rejects.toThrow('manual reconciliation'); expect(t.calls.filter(c=>c.query===CREATE_DRAFT)).toHaveLength(1);
 });
 it('retains the claim after reopening and prevents a second connection from claiming it', () => {
  const dir=mkdtempSync(join(tmpdir(),'commerce-journal-'));const path=join(dir,'journal.db');
  const first=new DraftJournal(path);const second=new DraftJournal(path);const p=analyseSupplierCatalogue(feed(),now).proposals[0];
  try { first.claim(feed().domain,p); expect(()=>second.claim(feed().domain,p)).toThrow(); } finally { first.close();second.close(); }
  const reopened=new DraftJournal(path);
  try { expect(reopened.get(feed().domain,p.sourceKey)?.state).toBe('pending'); } finally { reopened.close();rmSync(dir,{recursive:true}); }
 });
 it('halts if evidence expires while reading Shopify', async () => {
  const {t,o}=options();let n=0;await expect(importSupplierDrafts(feed(),{...o,now:()=>++n===1?now:now+86400000})).rejects.toThrow('expired');
  expect(t.calls.some(c=>c.query===CREATE_DRAFT)).toBe(false);
 });
 it.each(['read_products,write_products','read_products,write_products,read_inventory,write_orders'])('rejects incomplete or unrelated draft scopes %s', async scope => {
  const request=(async()=>new Response(JSON.stringify({access_token:'test',scope,expires_in:3600}))) as typeof fetch;
  await expect(shopifyTokenProvider('test.myshopify.com',{SHOPIFY_CLIENT_ID:'id',SHOPIFY_CLIENT_SECRET:'secret'},request,()=>now,'draft-write')()).rejects.toThrow('authentication');
 });
 it('write scope is opt-in; existing reader still rejects it', async () => {
  const request=(async()=>new Response(JSON.stringify({access_token:'test',scope:'read_products,write_products,read_inventory',expires_in:3600}))) as typeof fetch;
  const env={SHOPIFY_CLIENT_ID:'id',SHOPIFY_CLIENT_SECRET:'secret'};
  await expect(shopifyTokenProvider('test.myshopify.com',env,request,()=>now)()).rejects.toThrow('authentication');
  await expect(shopifyTokenProvider('test.myshopify.com',env,request,()=>now,'draft-write')()).resolves.toBe('test');
 });
});
