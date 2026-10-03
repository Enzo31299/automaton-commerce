import { object } from './agents.js';
import { decimalCents, importVariant } from './import.js';

export const SHOPIFY_API_VERSION = '2026-07';
export const CATALOGUE_QUERY = `query CommerceCatalogue($first: Int!, $after: String) {
 shop { myshopifyDomain currencyCode }
 productVariants(first: $first, after: $after) {
  nodes { id sku price inventoryQuantity product { id title productType } }
  pageInfo { hasNextPage endCursor }
 }
}`;
export interface CatalogueVariant { id: string; sku: string; price: string; inventoryQuantity: number | null; product: { id: string; title: string; productType: string } }
export interface CatalogueSnapshot { domain: string; currency: string; observedAt: string; variants: CatalogueVariant[] }
export function shopDomain(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) throw new Error('Expected a myshopify.com domain without a path');
  return value;
}
/** Read-only fixed query; tokens never go to configurable hosts or redirects. */
export async function readShopifyCatalogue(domain: string, token: string, request: typeof fetch = fetch): Promise<CatalogueSnapshot> {
  shopDomain(domain);
  if (!token || /\s/.test(token)) throw new Error('Missing or invalid Shopify access token');
  const variants: CatalogueVariant[] = [];
  const cursors = new Set<string>(); const ids = new Set<string>();
  let after: string | null = null; let currency: string | undefined;
  for (let page = 0; page < 100; page++) {
    let response: Response;
    try {
      response = await request(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type':'application/json', 'X-Shopify-Access-Token':token },
        body: JSON.stringify({ query: CATALOGUE_QUERY, variables: { first: 50, after } }),
      });
    } catch { throw new Error('Shopify read failed or timed out'); }
    if (!response.ok) throw new Error(`Shopify read failed (HTTP ${response.status})`);
    const body = object(await response.json());
    if (body.errors) throw new Error('Shopify GraphQL returned errors');
    const data = object(body.data); const shop = object(data.shop);
    if (shop.myshopifyDomain !== domain || typeof shop.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(shop.currencyCode)) throw new Error('Shopify store identity mismatch');
    if (currency && currency !== shop.currencyCode) throw new Error('Shop currency changed during read');
    currency = shop.currencyCode;
    if (!['EUR','USD'].includes(currency)) throw new Error('Connected V1 supports EUR and USD stores only');
    const connection = object(data.productVariants);
    if (!Array.isArray(connection.nodes)) throw new Error('Invalid Shopify variants');
    for (const value of connection.nodes) {
      const v = object(value); const p = object(v.product);
      if (typeof v.id !== 'string' || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(v.id) || ids.has(v.id)) throw new Error('Invalid or duplicate variant ID');
      if (v.sku !== null && typeof v.sku !== 'string') throw new Error('Invalid SKU');
      decimalCents(v.price);
      if (v.inventoryQuantity !== null && !Number.isSafeInteger(v.inventoryQuantity)) throw new Error('Invalid Shopify inventory');
      if (typeof p.id !== 'string' || !/^gid:\/\/shopify\/Product\/\d+$/.test(p.id) || typeof p.title !== 'string' || typeof p.productType !== 'string') throw new Error('Invalid Shopify product');
      ids.add(v.id);
      variants.push({ id:v.id,sku:(v.sku as string | null) ?? '',price:v.price as string,inventoryQuantity:v.inventoryQuantity as number | null,product:{id:p.id,title:p.title,productType:p.productType} });
    }
    const info = object(connection.pageInfo);
    if (info.hasNextPage === false) return {domain,currency,observedAt:new Date().toISOString(),variants};
    if (info.hasNextPage !== true || typeof info.endCursor !== 'string' || !info.endCursor || cursors.has(info.endCursor)) throw new Error('Invalid Shopify pagination');
    after = info.endCursor; cursors.add(after);
  }
  throw new Error('Catalogue exceeds the 100-page safety limit');
}
/** Bind exact variant IDs to explicit cost evidence; never import unspecified SKUs. */
export function prepareShopifyBatch(snapshot: CatalogueSnapshot, assumptions: unknown) {
  const inputs = object(assumptions);
  const byId = new Map(snapshot.variants.map(v=>[v.id,v]));
  const products = Object.entries(inputs).map(([id,value]) => {
    const variant = byId.get(id); if (!variant) throw new Error(`Unknown variant ID: ${id}`);
    const p = object(value);
    if (p.currency !== snapshot.currency) throw new Error('Cost currency differs from Shopify store currency');
    return importVariant(variant, { ...p, title:variant.product.title });
  });
  return {products};
}
