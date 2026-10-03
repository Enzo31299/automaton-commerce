import { describe, expect, it, vi } from 'vitest';
import { readShopifyCatalogue, prepareShopifyBatch, CATALOGUE_QUERY } from '../commerce/shopify.js';
import product from '../../examples/commerce-product.json';
const domain='test-shop.myshopify.com';
const variant={id:'gid://shopify/ProductVariant/1',sku:'TEST',price:'9.90',inventoryQuantity:10,product:{id:'gid://shopify/Product/1',title:'Test',productType:'Accessories'}};
const body=(nodes=[variant],hasNextPage=false,endCursor:string|null=null)=>({data:{shop:{myshopifyDomain:domain,currencyCode:'EUR'},productVariants:{nodes,pageInfo:{hasNextPage,endCursor}}}});
const response=(value:unknown)=>new Response(JSON.stringify(value));
describe('Shopify read-only integration',()=>{
 it('paginates all variants using only the fixed query and rejects redirects',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(response(body([variant],true,'next'))).mockResolvedValueOnce(response(body([{...variant,id:'gid://shopify/ProductVariant/2'}])));
  const snapshot=await readShopifyCatalogue(domain,'test-token',mock);
  expect(snapshot.variants).toHaveLength(2);
  expect(JSON.parse(mock.mock.calls[1][1].body).variables.after).toBe('next');
  expect(mock.mock.calls[0][1].redirect).toBe('error');
  expect(CATALOGUE_QUERY).not.toContain('mutation');
 });
 it('never sends tokens to arbitrary domains',async()=>{
  const mock=vi.fn();
  await expect(readShopifyCatalogue('https://evil.test','secret',mock)).rejects.toThrow();
  expect(mock).not.toHaveBeenCalled();
 });
 it.each([{errors:[{message:'secret'}]}, {data:{...body().data,shop:{myshopifyDomain:'other.myshopify.com',currencyCode:'EUR'}}}, body([variant,variant])])('rejects failed or inconsistent responses',async value=>{
  await expect(readShopifyCatalogue(domain,'test-token',vi.fn().mockResolvedValue(response(value)))).rejects.toThrow();
 });
 it('rejects repeated pagination cursor',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(response(body([variant],true,'next'))).mockResolvedValueOnce(response(body([{...variant,id:'gid://shopify/ProductVariant/2'}],true,'next')));
  await expect(readShopifyCatalogue(domain,'test-token',mock)).rejects.toThrow('pagination');
 });
 it('binds exact IDs and explicit supplier stock, rejects FX assumptions',async()=>{
  const snapshot=await readShopifyCatalogue(domain,'test-token',vi.fn().mockResolvedValue(response(body())));
  expect(prepareShopifyBatch(snapshot,{[variant.id]:{...product,stock:0}}).products[0]).toMatchObject({sku:'TEST',salePriceCents:990,stock:0});
  expect(()=>prepareShopifyBatch(snapshot,{[variant.id]:{...product,currency:'USD'}})).toThrow();
  expect(()=>prepareShopifyBatch(snapshot,{unknown:product})).toThrow();
 });
 it('does not expose network error secrets',async()=>{
  await expect(readShopifyCatalogue(domain,'secret',vi.fn().mockRejectedValue(new Error('secret')))).rejects.toThrow('Shopify read failed or timed out');
 });
});
