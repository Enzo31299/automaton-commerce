import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyseSupplierCatalogue } from './supplier-catalogue.js';
import { DraftJournal, importSupplierDrafts } from './draft-writer.js';
import { shopifyTokenProvider } from './shopify-auth.js';

export async function main(args = process.argv.slice(2)): Promise<void> {
  process.umask(0o077);
  if (args.length !== 2 && (args.length !== 5 || args[2] !== '--apply-drafts' || !/^[a-f0-9]{64}$/.test(args[3]))) {
    throw new Error('Usage: catalogue-import <supplier-export.json> <new-private-report.json> [--apply-drafts <reviewed-plan-hash> <private-journal.db>]');
  }
  const path = resolve(args[0]);
  const raw = readFileSync(path);
  if (raw.length > 5_000_000) throw new Error('Catalogue exceeds 5 MB limit');
  const feed: unknown = JSON.parse(raw.toString('utf8'));
  const plan = analyseSupplierCatalogue(feed);
  // Exclusive output creation prevents accidentally overwriting input, secrets or a previous report.
  writeFileSync(resolve(args[1]), JSON.stringify(plan, null, 2), { mode: 0o600, flag: 'wx' });
  if (args.length === 2) {
    console.log(JSON.stringify({ mode: 'dry-run', accepted: plan.proposals.length, planHash: plan.planHash, shopWrites: false })); return;
  }
  if (process.env.COMMERCE_ENABLE_DRAFT_WRITES !== 'true' || process.env.SHOPIFY_SHOP_DOMAIN !== plan.domain) throw new Error('Set draft write switch and matching store domain securely');
  if ([path, resolve(args[1])].includes(resolve(args[4]))) throw new Error('Journal path must be separate');
  const getToken = shopifyTokenProvider(plan.domain, process.env, fetch, Date.now, 'draft-write');
  const journal = new DraftJournal(resolve(args[4]));
  try {
    const result = await importSupplierDrafts(feed, { domain: plan.domain, approvedPlanHash: args[3], enabled: true, journal, getToken });
    console.log(JSON.stringify({ mode: 'draft-import', created: result.filter(r => !r.skipped).length, skipped: result.filter(r => r.skipped).length, published: 0 }));
  } finally { journal.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Catalogue import stopped. Review private evidence, permissions and journal; an uncertain draft write must not be retried automatically.'); process.exitCode = 1; });
}
