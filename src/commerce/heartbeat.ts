import type { HeartbeatTaskFn } from '../types.js';
import { CommerceStore } from './store.js';
import { marginAgent, stockAgent } from './agents.js';

/** Scheduled local analysis reuses the durable scheduler, leases and wake events. */
export const commerceCatalogueReview: HeartbeatTaskFn = async (_tick, ctx) => {
  const store = new CommerceStore(ctx.db);
  const alerts: string[] = [];
  ctx.db.runTransaction(() => {
    for (const product of store.list()) {
      const margin = marginAgent(product);
      const stock = stockAgent(product);
      store.report('margin', product.sku, margin);
      store.report('stock', product.sku, stock);
      if (!margin.profitable || stock.status !== 'healthy') alerts.push(product.sku);
    }
    ctx.db.setKV('commerce:last_review', JSON.stringify({ timestamp: new Date().toISOString(), alerts }));
  });
  return { shouldWake: alerts.length > 0, message: alerts.length ? `Commerce review: ${alerts.length} SKU(s) need margin or stock review.` : undefined };
};
