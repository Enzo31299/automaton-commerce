/** Commerce V1: deterministic analysis; money is always integer minor units. */
export interface Product {
  sku: string;
  title: string;
  category: string;
  currency: string;
  salePriceCents: number;
  supplierCostCents: number;
  shippingCostCents: number;
  paymentFeeBps: number;
  paymentFixedCents: number;
  taxReserveCents: number;
  returnReserveCents: number;
  advertisingCostCents: number;
  stock: number;
  dailySales: number;
  leadTimeDays: number;
  safetyStock: number;
}
export interface SupplierOffer {
  supplier: string;
  currency: string;
  unitCostCents: number;
  shippingCostCents: number;
  stock: number;
  leadTimeDays: number;
  traceabilityVerified: boolean;
  complianceVerified: boolean;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`Invalid ${field}`);
  return value.trim();
}
export function nonnegative(value: unknown, field: string, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw new Error(`Invalid ${field}`);
  return value;
}
function currency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) throw new Error('Invalid currency');
  return value;
}
export function validateProduct(value: unknown): Product {
  const p = object(value);
  const result: Product = {
    sku: text(p.sku, 'sku'), title: text(p.title, 'title'), category: text(p.category, 'category'),
    currency: currency(p.currency),
    salePriceCents: nonnegative(p.salePriceCents, 'salePriceCents'),
    supplierCostCents: nonnegative(p.supplierCostCents, 'supplierCostCents'),
    shippingCostCents: nonnegative(p.shippingCostCents, 'shippingCostCents'),
    paymentFeeBps: nonnegative(p.paymentFeeBps, 'paymentFeeBps'),
    paymentFixedCents: nonnegative(p.paymentFixedCents, 'paymentFixedCents'),
    taxReserveCents: nonnegative(p.taxReserveCents, 'taxReserveCents'),
    returnReserveCents: nonnegative(p.returnReserveCents, 'returnReserveCents'),
    advertisingCostCents: nonnegative(p.advertisingCostCents, 'advertisingCostCents'),
    stock: nonnegative(p.stock, 'stock'), dailySales: nonnegative(p.dailySales, 'dailySales', false),
    leadTimeDays: nonnegative(p.leadTimeDays, 'leadTimeDays'), safetyStock: nonnegative(p.safetyStock, 'safetyStock'),
  };
  if (result.paymentFeeBps > 10000) throw new Error('paymentFeeBps exceeds 100%');
  return result;
}
export function catalogueAgent(value: unknown): Product { return validateProduct(value); }
export function marginAgent(value: unknown) {
  const p = validateProduct(value);
  const paymentFeeCents = Math.ceil(p.salePriceCents * p.paymentFeeBps / 10000) + p.paymentFixedCents;
  const totalCostCents = p.supplierCostCents + p.shippingCostCents + paymentFeeCents + p.taxReserveCents + p.returnReserveCents + p.advertisingCostCents;
  if (!Number.isSafeInteger(totalCostCents) || !Number.isSafeInteger(p.salePriceCents * p.paymentFeeBps)) throw new Error('Money calculation exceeds safe integer range');
  const contributionCents = p.salePriceCents - totalCostCents;
  return { sku: p.sku, currency: p.currency, paymentFeeCents, totalCostCents, contributionCents,
    marginBps: p.salePriceCents ? Math.round(contributionCents / p.salePriceCents * 10000) : null,
    profitable: contributionCents > 0 };
}
export function stockAgent(value: unknown) {
  const p = validateProduct(value);
  const reorderPoint = Math.ceil(p.dailySales * p.leadTimeDays) + p.safetyStock;
  if (!Number.isSafeInteger(reorderPoint)) throw new Error('Stock calculation exceeds safe integer range');
  return { sku: p.sku, status: p.stock === 0 ? 'out_of_stock' : p.stock <= reorderPoint ? 'reorder' : 'healthy',
    reorderPoint, suggestedOrderQuantity: Math.max(0, reorderPoint - p.stock),
    daysOfCover: p.dailySales ? p.stock / p.dailySales : null };
}
export function sourcingAgent(value: unknown, values: unknown) {
  const product = validateProduct(value);
  if (!Array.isArray(values) || values.length > 100) throw new Error('Expected at most 100 supplier offers');
  const offers = values.map(value => {
    const o = object(value);
    if (typeof o.traceabilityVerified !== 'boolean' || typeof o.complianceVerified !== 'boolean') throw new Error('Verification flags must be boolean');
    const offer: SupplierOffer = {
      supplier: text(o.supplier, 'supplier'), currency: currency(o.currency),
      unitCostCents: nonnegative(o.unitCostCents, 'unitCostCents'), shippingCostCents: nonnegative(o.shippingCostCents, 'shippingCostCents'),
      stock: nonnegative(o.stock, 'stock'), leadTimeDays: nonnegative(o.leadTimeDays, 'leadTimeDays'),
      traceabilityVerified: o.traceabilityVerified, complianceVerified: o.complianceVerified,
    };
    const reasons = [];
    if (offer.currency !== product.currency) reasons.push('currency_mismatch');
    if (!offer.traceabilityVerified) reasons.push('traceability_unverified');
    if (!offer.complianceVerified) reasons.push('compliance_unverified');
    if (!offer.stock) reasons.push('out_of_stock');
    const margin = marginAgent({ ...product, supplierCostCents: offer.unitCostCents, shippingCostCents: offer.shippingCostCents });
    if (!margin.profitable) reasons.push('non_positive_contribution');
    return { ...offer, contributionCents: margin.contributionCents, eligible: reasons.length === 0, reasons };
  });
  const eligible = offers.filter(o => o.eligible).sort((a, b) => b.contributionCents - a.contributionCents || a.leadTimeDays - b.leadTimeDays || a.supplier.localeCompare(b.supplier));
  return { sku: product.sku, recommended: eligible[0] ?? null, offers };
}
