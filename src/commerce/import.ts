import { object, validateProduct, type Product } from './agents.js';

/** Exact decimal conversion for the V1 two-decimal currency contract. */
export function decimalCents(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Expected a two-decimal money string');
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Money exceeds safe integer range');
  return Number(cents);
}

/** Offline dry-run boundary. Never assumes Shopify inventory is supplier stock. */
export function importVariant(value: unknown, assumptions: unknown): Product {
  const variant = object(value);
  const inputs = object(assumptions);
  if (typeof variant.id !== 'string' || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variant.id)) throw new Error('Invalid Shopify variant ID');
  if (typeof variant.sku !== 'string' || !variant.sku.trim()) throw new Error('Missing Shopify SKU');
  // All operating costs, demand and supplier stock must be supplied explicitly.
  return validateProduct({ ...inputs, sku: variant.sku, salePriceCents: decimalCents(variant.price) });
}
