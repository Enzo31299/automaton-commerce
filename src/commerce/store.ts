import type { AutomatonDatabase } from '../types.js';
import { catalogueAgent, type Product } from './agents.js';

/** Additive, namespaced storage; upstream schema and memory stay intact. */
export class CommerceStore {
  constructor(private readonly db: AutomatonDatabase) {
    db.raw.exec(`CREATE TABLE IF NOT EXISTS commerce_products (
      sku TEXT PRIMARY KEY, product_json TEXT NOT NULL, updated_at TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS commerce_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, sku TEXT NOT NULL,
      report_json TEXT NOT NULL, created_at TEXT NOT NULL
    );`);
  }
  upsert(value: unknown): Product {
    const p = catalogueAgent(value);
    this.db.raw.prepare(`INSERT INTO commerce_products VALUES (?, ?, ?)
      ON CONFLICT(sku) DO UPDATE SET product_json=excluded.product_json, updated_at=excluded.updated_at`)
      .run(p.sku, JSON.stringify(p), new Date().toISOString());
    return p;
  }
  get(sku: string): Product {
    const row = this.db.raw.prepare('SELECT product_json FROM commerce_products WHERE sku=?').get(sku) as { product_json: string } | undefined;
    if (!row) throw new Error(`Unknown SKU: ${sku}`);
    return catalogueAgent(JSON.parse(row.product_json));
  }
  list(): Product[] {
    return (this.db.raw.prepare('SELECT product_json FROM commerce_products ORDER BY sku').all() as {product_json: string}[])
      .map(row => catalogueAgent(JSON.parse(row.product_json)));
  }
  report(agent: string, sku: string, result: unknown): void {
    this.db.raw.prepare('INSERT INTO commerce_reports (agent,sku,report_json,created_at) VALUES (?,?,?,?)')
      .run(agent, sku, JSON.stringify(result), new Date().toISOString());
  }
}
