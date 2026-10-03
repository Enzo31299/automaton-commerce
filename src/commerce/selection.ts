import { object, nonnegative, validateProduct, marginAgent, sourcingAgent } from './agents.js';

/** Supplied Minea observations are market signals, never verified sales. */
export function selectionAgent(values: unknown, now = Date.now()) {
  if (!Array.isArray(values) || values.length > 100) throw new Error('Expected at most 100 candidates');
  const seen = new Set<string>();
  const candidates = values.map(value => {
    const candidate = object(value);
    const product = validateProduct(candidate.product);
    if (seen.has(product.sku)) throw new Error('Duplicate candidate SKU');
    seen.add(product.sku);
    const margin = marginAgent(product);
    const sourcing = sourcingAgent(product, candidate.offers);
    const reasons: string[] = [];
    if (!margin.profitable) reasons.push('non_positive_current_contribution');
    if (!sourcing.recommended) reasons.push('no_eligible_supplier');
    let activeDays: number | null = null;
    let sourceUrl: string | null = null;
    let observedAt: string | null = null;
    if (candidate.minea === undefined || candidate.minea === null) reasons.push('missing_minea_evidence');
    else {
      const evidence = object(candidate.minea);
      if (typeof evidence.sourceUrl !== 'string') throw new Error('Missing Minea source URL');
      const url = new URL(evidence.sourceUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'app.minea.com' || url.username || url.password || url.search || url.hash) throw new Error('Expected a safe Minea evidence URL');
      sourceUrl = url.href;
      if (typeof evidence.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(evidence.observedAt)) throw new Error('Expected UTC observation timestamp');
      const timestamp = Date.parse(evidence.observedAt);
      if (!Number.isFinite(timestamp)) throw new Error('Invalid observation timestamp');
      observedAt = evidence.observedAt;
      if (timestamp > now || now - timestamp > 7 * 86400000) reasons.push('stale_or_future_minea_evidence');
      if (evidence.sku !== product.sku || evidence.productMatchVerified !== true) reasons.push('unverified_product_match');
      activeDays = nonnegative(evidence.activeDays, 'activeDays');
      if (!activeDays) reasons.push('no_active_ad_signal');
    }
    return { sku: product.sku, eligible: reasons.length === 0, reasons, margin, sourcing,
      minea: { sourceUrl, observedAt, activeDays } };
  });
  const ranked = candidates.filter(c => c.eligible).sort((a,b) =>
    b.margin.contributionCents - a.margin.contributionCents ||
    (b.minea.activeDays ?? 0) - (a.minea.activeDays ?? 0) || a.sku.localeCompare(b.sku));
  return { mode: 'recommendation', rankedSkus: ranked.map(c => c.sku), candidates };
}
