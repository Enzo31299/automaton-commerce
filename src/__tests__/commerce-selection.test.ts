import { describe, expect, it } from 'vitest';
import { selectionAgent } from '../commerce/selection.js';
import product from '../../examples/commerce-product.json';
const now = Date.parse('2026-10-03T16:00:00Z');
const offer = { supplier:'A', currency:'EUR',unitCostCents:500,shippingCostCents:300,stock:5,leadTimeDays:5,traceabilityVerified:true,complianceVerified:true };
const minea = { sku:product.sku,sourceUrl:'https://app.minea.com/fr/products/example/details', observedAt:'2026-10-03T15:00:00Z',productMatchVerified:true,activeDays:15 };
const candidate = { product,offers:[offer],minea };
describe('commerce selection with Minea evidence', () => {
  it('ranks only profitable candidates with eligible suppliers and dated product matches', () => {
    expect(selectionAgent([candidate],now).rankedSkus).toEqual([product.sku]);
  });
  it.each([
    {minea:null}, {minea:{...minea,productMatchVerified:false}},
    {minea:{...minea,sku:'OTHER'}}, {minea:{...minea,observedAt:'2026-09-01T00:00:00Z'}},
    {minea:{...minea,observedAt:'2026-10-04T00:00:00Z'}}, {minea:{...minea,activeDays:0}},
    {offers:[{...offer,currency:'USD'}]}, {offers:[{...offer,complianceVerified:false}]},
    {product:{...product,supplierCostCents:5000}},
  ])('blocks incomplete or unsafe evidence %j', patch => {
    expect(selectionAgent([{...candidate,...patch}],now).rankedSkus).toEqual([]);
  });
  it('rejects secret-bearing URLs and duplicate SKUs', () => {
    expect(() => selectionAgent([{...candidate,minea:{...minea,sourceUrl:'https://app.minea.com/fr?token=secret'}}],now)).toThrow();
    expect(() => selectionAgent([candidate,candidate],now)).toThrow();
  });
});
