import Database from 'better-sqlite3';
import { object } from './agents.js';
import { readShopifyCatalogue, shopDomain, SHOPIFY_API_VERSION } from './shopify.js';
import { analyseSupplierCatalogue, digest, type DraftProposal } from './supplier-catalogue.js';

export const DRAFT_LOOKUP = `query CommerceDraftLookup($query: String!) {
 shop { myshopifyDomain currencyCode }
 products(first: 2, query: $query) { nodes { id handle } }
}`;
export const CREATE_DRAFT = `mutation CommerceCreateDraft($input: ProductSetInput!) {
 productSet(input: $input, synchronous: true) {
  product { id handle status variants(first: 100) { nodes { sku price inventoryPolicy inventoryItem { tracked } } pageInfo { hasNextPage } } }
  userErrors { field message }
 }
}`;
export class DraftJournal {
  readonly db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path); this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS commerce_draft_imports (
      domain TEXT NOT NULL, source_key TEXT NOT NULL, handle TEXT NOT NULL, input_hash TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','created')), product_id TEXT, evidence_json TEXT NOT NULL,
      PRIMARY KEY(domain, source_key), UNIQUE(domain, handle)
    )`);
  }
  get(domain: string, sourceKey: string) {
    return this.db.prepare('SELECT * FROM commerce_draft_imports WHERE domain=? AND source_key=?').get(domain, sourceKey) as
      {state: string; input_hash: string; product_id: string | null} | undefined;
  }
  claim(domain: string, p: DraftProposal) {
    // Autocommit before the HTTP write: a crash/timeout permanently blocks automatic retry.
    this.db.prepare('INSERT INTO commerce_draft_imports VALUES (?,?,?,?,?,?,?)')
      .run(domain, p.sourceKey, p.input.handle, digest(p.input), 'pending', null, JSON.stringify(p.evidence));
  }
  complete(domain: string, sourceKey: string, id: string) {
    this.db.prepare("UPDATE commerce_draft_imports SET state='created', product_id=? WHERE domain=? AND source_key=? AND state='pending'").run(id, domain, sourceKey);
  }
  close() { this.db.close(); }
}
async function graphql(domain: string, token: string, query: string, variables: unknown, request: typeof fetch) {
  shopDomain(domain); if (!token || /\s/.test(token)) throw new Error('Invalid access token');
  try {
    const response = await request(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error('HTTP rejected');
    const body = object(await response.json()); if (body.errors) throw new Error('GraphQL rejected');
    return object(body.data);
  } catch { throw new Error('Shopify draft request failed; inspect the private journal before any retry'); }
}
/** Only consumes freshly validated feed. Never accepts caller-supplied GraphQL, IDs or mutation input. */
export async function importSupplierDrafts(feed: unknown, options: {
  domain: string; approvedPlanHash: string; enabled: boolean; journal: DraftJournal; getToken: () => Promise<string>;
  request?: typeof fetch; now?: () => number;
}) {
  if (!options.enabled) throw new Error('Draft writes disabled');
  const now = options.now ?? Date.now; const plan = analyseSupplierCatalogue(feed, now());
  if (plan.domain !== options.domain || plan.planHash !== options.approvedPlanHash) throw new Error('Store or approved plan changed');
  if (!plan.proposals.length) throw new Error('No eligible supplier products');
  const request = options.request ?? fetch;
  // Full Shopify SKU pagination and store identity are checked before any claim/write.
  const snapshot = await readShopifyCatalogue(plan.domain, await options.getToken(), request);
  if (snapshot.currency !== plan.currency) throw new Error('Store currency mismatch');
  const existingSkus = new Set(snapshot.variants.map(v => v.sku));
  for (const proposal of plan.proposals) {
    const row = options.journal.get(plan.domain, proposal.sourceKey);
    if (row && (row.state !== 'created' || row.input_hash !== digest(proposal.input))) throw new Error('Uncertain or changed draft import requires manual reconciliation');
    if (!row && proposal.input.variants.some(v => existingSkus.has(v.sku))) throw new Error('Supplier SKU already exists in Shopify');
  }
  const result: {sourceKey: string; id: string; skipped: boolean}[] = [];
  for (const p of plan.proposals) {
    // Time spent authenticating/reading cannot turn stale evidence into an eligible write.
    const fresh = analyseSupplierCatalogue(feed, now());
    if (fresh.planHash !== plan.planHash) throw new Error('Evidence expired during import');
    const row = options.journal.get(plan.domain, p.sourceKey);
    if (row?.state === 'created') { result.push({ sourceKey: p.sourceKey, id: row.product_id!, skipped: true }); continue; }
    const data = await graphql(plan.domain, await options.getToken(), DRAFT_LOOKUP,
      { query: `status:active,draft,archived,unlisted handle:${p.input.handle}` }, request);
    const shop = object(data.shop); const products = object(data.products);
    if (shop.myshopifyDomain !== plan.domain || shop.currencyCode !== plan.currency) throw new Error('Store identity mismatch');
    if (!Array.isArray(products.nodes) || products.nodes.length) throw new Error('Handle exists or lookup is invalid');
    const token = await options.getToken();
    if (analyseSupplierCatalogue(feed, now()).planHash !== plan.planHash) throw new Error('Evidence expired before write');
    options.journal.claim(plan.domain, p);
    const payload = object((await graphql(plan.domain, token, CREATE_DRAFT, { input: p.input }, request)).productSet);
    if (!Array.isArray(payload.userErrors) || payload.userErrors.length) throw new Error('Draft creation rejected; manual reconciliation required');
    const product = object(payload.product); const variants = object(product.variants);
    if (typeof product.id !== 'string' || !/^gid:\/\/shopify\/Product\/\d+$/.test(product.id)
      || product.handle !== p.input.handle || product.status !== 'DRAFT' || object(variants.pageInfo).hasNextPage !== false
      || !Array.isArray(variants.nodes) || variants.nodes.length !== p.input.variants.length) throw new Error('Draft confirmation incomplete; manual reconciliation required');
    const received = variants.nodes.map(v => object(v));
    for (const expected of p.input.variants) {
      const matches = received.filter(v => v.sku === expected.sku);
      if (matches.length !== 1 || Number(matches[0].price) !== Number(expected.price)
        || matches[0].inventoryPolicy !== 'DENY' || object(matches[0].inventoryItem).tracked !== true) throw new Error('Draft variant confirmation failed; manual reconciliation required');
    }
    options.journal.complete(plan.domain, p.sourceKey, product.id);
    result.push({ sourceKey: p.sourceKey, id: product.id, skipped: false });
  }
  return result;
}
