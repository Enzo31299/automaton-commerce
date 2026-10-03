import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { object } from './agents.js';
import { shopifyTokenProvider } from './shopify-auth.js';
import { readShopifyCatalogue, prepareShopifyBatch } from './shopify.js';
import { runCommerceRuntime } from './runtime.js';

/** Each read updates Shopify prices/titles only; supplier evidence remains explicit. */
export function shopifyBatchSource(domain: string, evidencePath: string, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch) {
  const getToken = shopifyTokenProvider(domain, env, request);
  return async () => {
    const evidence = object(JSON.parse(readFileSync(evidencePath, 'utf8')));
    const snapshot = await readShopifyCatalogue(domain, await getToken(), request);
    const batch = prepareShopifyBatch(snapshot, evidence.assumptionsByVariantId);
    return { ...batch, offersBySku: evidence.offersBySku ?? {} };
  };
}
export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length < 2 || args.length > 3 || (args[2] !== undefined && args[2] !== '--once')) throw new Error('Usage: commerce-shopify-runtime <evidence.json> <sqlite-path> [--once]');
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!domain) throw new Error('Set SHOPIFY_SHOP_DOMAIN securely');
  const refreshBatch = shopifyBatchSource(domain, resolve(args[0]));
  const controller = new AbortController(); const stop = () => controller.abort();
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const initial = await refreshBatch();
    await runCommerceRuntime(initial, resolve(args[1]), { once: args[2] === '--once', signal: controller.signal, refreshBatch });
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Shopify commerce runtime stopped. Verify credentials and complete private evidence; no shop writes were made.'); process.exitCode = 1; });
}
