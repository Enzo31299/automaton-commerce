import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../state/database.js';
import { CommerceStore } from './store.js';
import { object, validateProduct, marginAgent, stockAgent, sourcingAgent } from './agents.js';
import type { AutomatonDatabase } from '../types.js';

/** Deterministic local analysis entrypoint; no network or legacy provisioning. */
export function runCommerceBatch(db: AutomatonDatabase, input: unknown) {
  const batch = object(input);
  if (!Array.isArray(batch.products) || batch.products.length === 0 || batch.products.length > 1000) throw new Error('Expected 1 to 1000 products');
  const offers = batch.offersBySku === undefined ? {} : object(batch.offersBySku);
  // Validate and calculate everything before writing: failed batches leave no partial drafts.
  const seen = new Set<string>();
  const results = batch.products.map(value => {
    const product = validateProduct(value);
    if (seen.has(product.sku)) throw new Error(`Duplicate SKU: ${product.sku}`);
    seen.add(product.sku);
    return { product, margin: marginAgent(product), stock: stockAgent(product),
      sourcing: sourcingAgent(product, Object.hasOwn(offers, product.sku) ? offers[product.sku] : []) };
  });
  for (const sku of Object.keys(offers)) if (!seen.has(sku)) throw new Error(`Offers for unknown SKU: ${sku}`);
  db.runTransaction(() => {
    const store = new CommerceStore(db);
    for (const result of results) {
      store.upsert(result.product);
      store.report('margin', result.product.sku, result.margin);
      store.report('stock', result.product.sku, result.stock);
      store.report('sourcing', result.product.sku, result.sourcing);
    }
    db.setKV('commerce:last_batch', new Date().toISOString());
  });
  return { mode: 'local-analysis', shopWrites: false, results };
}

export function main(args = process.argv.slice(2)): void {
  if (args.length !== 2) throw new Error('Usage: commerce-analyse <batch.json> <sqlite-path>');
  const input: unknown = JSON.parse(readFileSync(resolve(args[0]), 'utf8'));
  const db = createDatabase(resolve(args[1]));
  try { console.log(JSON.stringify(runCommerceBatch(db, input), null, 2)); }
  finally { db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : 'Commerce analysis failed'); process.exitCode = 1; }
}
