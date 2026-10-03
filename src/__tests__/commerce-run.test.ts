import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../state/database.js';
import { runCommerceBatch } from '../commerce/run.js';
import { CommerceStore } from '../commerce/store.js';
import product from '../../examples/commerce-product.json';
const databases: ReturnType<typeof createDatabase>[] = [];
const database = () => { const db = createDatabase(':memory:'); databases.push(db); return db; };
afterEach(() => databases.splice(0).forEach(db => db.close()));
describe('commerce local startup', () => {
  it('runs all four agents and persists reports without a wallet or provider', () => {
    const db = database();
    const report = runCommerceBatch(db, { products: [product] });
    expect(report).toMatchObject({ mode: 'local-analysis', shopWrites: false });
    expect(report.results[0].sourcing.recommended).toBeNull();
    expect(new CommerceStore(db).list()).toEqual([product]);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM commerce_reports').get()).toEqual({ n: 3 });
    expect(db.getTurnCount()).toBe(0);
  });
  it('rejects invalid batches before persisting any product', () => {
    const db = database(); const store = new CommerceStore(db);
    for (const input of [ { products: [product, product] }, { products: [product, {...product, sku:'B', stock:-1}] },
      { products:[product], offersBySku:{ unknown: [] } }, { products:[] } ]) {
      expect(() => runCommerceBatch(db,input)).toThrow();
      expect(store.list()).toEqual([]);
    }
  });
});
