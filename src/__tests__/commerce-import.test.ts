import { describe, expect, it } from 'vitest';
import { decimalCents, importVariant } from '../commerce/import.js';
import product from '../../examples/commerce-product.json';

describe('commerce import dry-run boundary', () => {
  it('converts decimal money exactly', () => {
    expect(decimalCents('9.90')).toBe(990);
    expect(decimalCents('1.01')).toBe(101);
    expect(decimalCents('0')).toBe(0);
  });
  it.each(['1.001', '-1', '1e3', '€9.90', 'NaN', '90071992547410'])('rejects ambiguous or unsafe amount %s', amount => {
    expect(() => decimalCents(amount)).toThrow();
  });
  const variant = { id: 'gid://shopify/ProductVariant/1', sku: 'SHOP-1', price: '9.90', inventoryQuantity: 10 };
  it('preserves explicit supplier stock rather than store quantity', () => {
    const imported = importVariant(variant, { ...product, stock: 0 });
    expect(imported.stock).toBe(0);
    expect(imported.salePriceCents).toBe(990);
    expect(imported.sku).toBe('SHOP-1');
  });
  it('rejects missing assumptions and missing SKU', () => {
    expect(() => importVariant(variant, {})).toThrow();
    expect(() => importVariant({ ...variant, sku: '' }, product)).toThrow();
  });
});
