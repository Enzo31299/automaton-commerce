import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readShopifyCatalogue, prepareShopifyBatch } from './shopify.js';
import { shopifyTokenProvider } from './shopify-auth.js';
import { runCommerceBatch } from './run.js';
import { selectionAgent } from './selection.js';
import { object } from './agents.js';
import { createDatabase } from '../state/database.js';
import { CommerceStore } from './store.js';

/** Fixed Shopify read plus explicit offline supplier/Minea evidence, recommendations only. */
export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length !== 2) throw new Error('Usage: commerce-connected <evidence.json> <sqlite-path>');
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!domain) throw new Error('Set SHOPIFY_SHOP_DOMAIN securely');
  const getToken = shopifyTokenProvider(domain);
  const evidence = object(JSON.parse(readFileSync(resolve(args[0]), 'utf8')));
  const snapshot = await readShopifyCatalogue(domain,await getToken());
  const batch = prepareShopifyBatch(snapshot,evidence.assumptionsByVariantId);
  const offers = evidence.offersBySku === undefined ? {} : object(evidence.offersBySku);
  const minea = evidence.mineaBySku === undefined ? {} : object(evidence.mineaBySku);
  const skus = new Set(batch.products.map(p=>p.sku));
  for (const sku of Object.keys(minea)) if (!skus.has(sku)) throw new Error(`Minea evidence for unknown SKU: ${sku}`);
  const selection = selectionAgent(batch.products.map(product=>({product,offers:Object.hasOwn(offers,product.sku)?offers[product.sku]:[],minea:Object.hasOwn(minea,product.sku)?minea[product.sku]:undefined})));
  const db = createDatabase(resolve(args[1]));
  try {
    const report = db.runTransaction(() => {
      const result = runCommerceBatch(db,{...batch,offersBySku:offers});
      const store = new CommerceStore(db);
      for (const candidate of selection.candidates) store.report('selection',candidate.sku,candidate);
      db.setKV('commerce:last_shopify_read',JSON.stringify({domain:snapshot.domain,observedAt:snapshot.observedAt,variantsRead:snapshot.variants.length}));
      return result;
    });
    console.log(JSON.stringify({ ...report, mode:'shopify-read-offline-evidence', variantsRead:snapshot.variants.length, selection,
      integration:{shopify:'read',autods:'supplied-evidence',minea:'supplied-evidence'} },null,2));
  } finally { db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(()=>{ console.error('Connected commerce failed. Verify credentials, catalogue and complete evidence; no shop changes were made.'); process.exitCode=1; });
}
