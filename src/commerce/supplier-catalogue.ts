import { createHash } from 'node:crypto';
import { catalogueAgent, marginAgent, stockAgent, sourcingAgent, object, nonnegative } from './agents.js';
import { shopDomain } from './shopify.js';

function text(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${field}`);
  return value.trim();
}
function url(value: unknown): string {
  const result = text(value, 'evidence URL', 2000); const parsed = new URL(result);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Expected public HTTPS evidence URL');
  return result;
}
function dated(value: unknown, now: number, maxAgeHours: number): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|\+00:00)$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now && now - time <= maxAgeHours * 3600000;
}
function escaped(value: string): string {
  return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export interface DraftInput {
  title: string; descriptionHtml: string; productType: string; handle: string; status: 'DRAFT';
  productOptions: {name: string; values: {name: string}[]}[];
  variants: { price: string; sku: string; inventoryPolicy: 'DENY'; inventoryItem: {tracked: true; requiresShipping: true}; optionValues: {optionName: string; name: string}[] }[];
}
export interface DraftProposal { sourceKey: string; input: DraftInput; evidence: unknown }
export interface CataloguePlan {
  domain: string; currency: string; country: string; maxAgeHours: number; evaluatedAt: string;
  source: 'supplier-export'; reports: unknown[]; proposals: DraftProposal[]; planHash: string;
}
/** Offline exchange only: evidence flags are operator attestations, never inferred from a URL. */
export function analyseSupplierCatalogue(value: unknown, now = Date.now()): CataloguePlan {
  const feed = object(value); if (feed.schemaVersion !== 1 || feed.source !== 'supplier-export') throw new Error('Expected supplier-export schemaVersion 1');
  const policy = object(feed.policy);
  const domain = shopDomain(text(feed.domain, 'domain')); const currency = text(feed.currency, 'currency');
  if (!['EUR', 'USD'].includes(currency)) throw new Error('Expected EUR or USD');
  const country = text(policy.country, 'country'); if (!/^[A-Z]{2}$/.test(country)) throw new Error('Invalid country');
  const maxAgeHours = nonnegative(policy.maxAgeHours, 'maxAgeHours');
  if (maxAgeHours < 1 || maxAgeHours > 24) throw new Error('Evidence age must be 1–24 hours');
  const minContributionCents = nonnegative(policy.minContributionCents, 'minContributionCents');
  const minMarginBps = nonnegative(policy.minMarginBps, 'minMarginBps');
  const maxLeadTimeDays = nonnegative(policy.maxLeadTimeDays, 'maxLeadTimeDays');
  if (!minContributionCents || !minMarginBps || minMarginBps > 10000 || !maxLeadTimeDays || maxLeadTimeDays > 60) throw new Error('Invalid acceptance thresholds');
  if (!Array.isArray(feed.products) || !feed.products.length || feed.products.length > 100) throw new Error('Expected 1–100 products');
  const seen = new Set<string>(); const skus = new Set<string>(); const reports: unknown[] = []; const proposals: DraftProposal[] = [];
  for (const raw of feed.products) {
    const c = object(raw); const supplier = text(c.supplier, 'supplier'); const productId = text(c.supplierProductId, 'supplierProductId');
    const sourceKey = JSON.stringify([supplier, productId]); if (seen.has(sourceKey)) throw new Error('Duplicate supplier product'); seen.add(sourceKey);
    const title = text(c.title, 'title'); const category = text(c.category, 'category');
    const description = text(c.description, 'description', 5000);
    const evidence = object(c.evidence); const references = object(evidence.references);
    // All references are preserved locally, never fetched or inserted in storefront copy.
    for (const field of ['stock', 'costs', 'shipping', 'returns', 'traceability', 'compliance', 'content']) url(references[field]);
    const reasons: string[] = [];
    if (!dated(evidence.observedAt, now, maxAgeHours)) reasons.push('stale_or_invalid_evidence');
    if (evidence.country !== country) reasons.push('shipping_country_mismatch');
    for (const flag of ['costsVerified', 'shippingVerified', 'returnsVerified', 'contentReviewed', 'traceabilityVerified', 'complianceVerified']) {
      if (evidence[flag] !== true) reasons.push(flag);
    }
    if (!Array.isArray(c.variants) || !c.variants.length || c.variants.length > 100) throw new Error('Expected 1–100 variants');
    const names = new Set<string>();
    const variants = c.variants.map(rawVariant => {
      const v = object(rawVariant); const name = text(v.name, 'variant name');
      if (names.has(name)) throw new Error('Duplicate variant option'); names.add(name);
      const product = catalogueAgent(v.product);
      if (skus.has(product.sku)) throw new Error('Duplicate SKU'); skus.add(product.sku);
      if (product.title !== title || product.category !== category || product.currency !== currency) throw new Error('Variant identity or currency mismatch');
      const margin = marginAgent(product); const stock = stockAgent(product);
      const sourcing = sourcingAgent(product, [{ supplier, currency, unitCostCents: product.supplierCostCents,
        shippingCostCents: product.shippingCostCents, stock: product.stock, leadTimeDays: product.leadTimeDays,
        traceabilityVerified: evidence.traceabilityVerified === true, complianceVerified: evidence.complianceVerified === true }]);
      if (!sourcing.recommended) reasons.push(`${product.sku}:supplier_ineligible`);
      if (stock.status !== 'healthy') reasons.push(`${product.sku}:stock_${stock.status}`);
      if (product.leadTimeDays > maxLeadTimeDays) reasons.push(`${product.sku}:delivery_too_slow`);
      if (margin.contributionCents < minContributionCents || (margin.marginBps ?? 0) < minMarginBps) reasons.push(`${product.sku}:margin_below_threshold`);
      return { name, product, margin, stock, sourcing };
    });
    reports.push({ sourceKey, accepted: !reasons.length, reasons, variants });
    if (!reasons.length) proposals.push({ sourceKey, evidence: { ...evidence, supplier, supplierProductId: productId }, input: {
      title, productType: category, descriptionHtml: `<p>${escaped(description).replace(/\n/g, '<br>')}</p>`,
      handle: `commerce-${digest(sourceKey).slice(0, 32)}`, status: 'DRAFT',
      productOptions: [{ name: 'Modèle', values: variants.map(v => ({ name: v.name })) }],
      variants: variants.map(v => ({ sku: v.product.sku, price: (v.product.salePriceCents / 100).toFixed(2),
        inventoryPolicy: 'DENY', inventoryItem: { tracked: true, requiresShipping: true }, optionValues: [{ optionName: 'Modèle', name: v.name }] })),
    } });
  }
  const payload = { domain, currency, country, maxAgeHours, source: 'supplier-export' as const, reports, proposals };
  return { ...payload, evaluatedAt: new Date(now).toISOString(), planHash: digest(payload) };
}
