import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../commerce/connected.js';
import { createDatabase } from '../state/database.js';
import product from '../../examples/commerce-product.json';
const dirs:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
describe('connected analysis command',()=>{
 it.each(['static', 'client'] as const)('reads Shopify with %s auth, runs agents and persists provenance locally',async mode=>{
  const dir=mkdtempSync(join(tmpdir(),'commerce-connected-'));dirs.push(dir);
  const id='gid://shopify/ProductVariant/1';
  writeFileSync(join(dir,'evidence.json'),JSON.stringify({assumptionsByVariantId:{[id]:product}}));
  vi.stubEnv('SHOPIFY_SHOP_DOMAIN','test.myshopify.com');vi.stubEnv('SHOPIFY_ACCESS_TOKEN',mode==='static'?'test-only':'');
  vi.stubEnv('SHOPIFY_CLIENT_ID',mode==='client'?'test-client':'');vi.stubEnv('SHOPIFY_CLIENT_SECRET',mode==='client'?'test-secret':'');
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{shop:{myshopifyDomain:'test.myshopify.com',currencyCode:'EUR'},productVariants:{nodes:[{id,sku:product.sku,price:'20.00',inventoryQuantity:999,product:{id:'gid://shopify/Product/1',title:product.title,productType:'Accessories'}}],pageInfo:{hasNextPage:false,endCursor:null}}}})));
  if(mode==='client') request.mockResolvedValueOnce(new Response(JSON.stringify({access_token:'test-only',scope:'read_products',expires_in:86399})));
  vi.stubGlobal('fetch',request);const output=vi.spyOn(console,'log').mockImplementation(()=>{});
  await main([join(dir,'evidence.json'),join(dir,'state.db')]);
  const report=JSON.parse(output.mock.calls[0][0]);
  expect(report.selection.rankedSkus).toEqual([]);
  expect(report.integration).toEqual({shopify:'read',autods:'supplied-evidence',minea:'supplied-evidence'});
  expect(request).toHaveBeenCalledTimes(mode==='client'?2:1);
  expect(request.mock.calls.at(-1)![1].headers['X-Shopify-Access-Token']).toBe('test-only');
  const db=createDatabase(join(dir,'state.db'));
  try {
   expect(db.raw.prepare('SELECT COUNT(*) AS n FROM commerce_reports').get()).toEqual({n:4});
   expect(JSON.parse(db.getKV('commerce:last_shopify_read')!).variantsRead).toBe(1);
  }finally{db.close();}
 });
 it('rejects missing runtime credentials before network or database work',async()=>{
  vi.stubEnv('SHOPIFY_SHOP_DOMAIN','');vi.stubEnv('SHOPIFY_ACCESS_TOKEN','');
  const request=vi.fn();vi.stubGlobal('fetch',request);
  await expect(main(['missing.json','missing.db'])).rejects.toThrow('Set SHOPIFY');
  expect(request).not.toHaveBeenCalled();
 });
});
