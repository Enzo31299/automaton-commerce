import type { AutomatonTool } from '../types.js';
import { marginAgent, stockAgent, sourcingAgent } from './agents.js';
import { CommerceStore } from './store.js';

const moneyFields = ['salePriceCents', 'supplierCostCents', 'shippingCostCents', 'paymentFixedCents', 'taxReserveCents', 'returnReserveCents', 'advertisingCostCents'];
const productProperties = {
  sku: { type: 'string', minLength: 1, maxLength: 200 },
  title: { type: 'string', minLength: 1, maxLength: 200 },
  category: { type: 'string', minLength: 1, maxLength: 200 },
  currency: { type: 'string', pattern: '^[A-Z]{3}$' },
  ...Object.fromEntries(moneyFields.map(field => [field, { type: 'integer', minimum: 0 }])),
  paymentFeeBps: { type: 'integer', minimum: 0, maximum: 10000 },
  stock: { type: 'integer', minimum: 0 }, dailySales: { type: 'number', minimum: 0 },
  leadTimeDays: { type: 'integer', minimum: 0 }, safetyStock: { type: 'integer', minimum: 0 },
};
const offerProperties = {
  supplier: { type: 'string', minLength: 1, maxLength: 200 },
  currency: { type: 'string', pattern: '^[A-Z]{3}$' },
  unitCostCents: { type: 'integer', minimum: 0 }, shippingCostCents: { type: 'integer', minimum: 0 },
  stock: { type: 'integer', minimum: 0 }, leadTimeDays: { type: 'integer', minimum: 0 },
  traceabilityVerified: { type: 'boolean' }, complianceVerified: { type: 'boolean' },
};

export function createCommerceTools(): AutomatonTool[] {
  return [
    {
      name: 'commerce_catalogue_upsert', category: 'commerce', riskLevel: 'caution',
      description: 'Catalogue Agent: validate and save a local draft product. Does not publish to a store. All costs must be supplied explicitly in minor currency units.',
      parameters: { type: 'object', properties: { product: { type: 'object', properties: productProperties, required: Object.keys(productProperties) } }, required: ['product'] },
      execute: async (args, ctx) => JSON.stringify(new CommerceStore(ctx.db).upsert(args.product)),
    },
    {
      name: 'commerce_catalogue_list', category: 'commerce', riskLevel: 'safe',
      description: 'Catalogue Agent: list validated local draft products.',
      parameters: { type: 'object', properties: {} },
      execute: async (_args, ctx) => JSON.stringify(new CommerceStore(ctx.db).list()),
    },
    ...(['margin', 'stock', 'sourcing'] as const).map(agent => ({
      name: `commerce_${agent}_analyse`, category: 'commerce' as const, riskLevel: 'safe' as const,
      description: `${agent} Agent: analyse a saved SKU and persist its report. Recommendations only; no orders, payments or store changes. Sourcing verification flags are supplied evidence, not independently verified.`,
      parameters: { type: 'object', properties: { sku: { type: 'string' }, ...(agent === 'sourcing' ? { offers: { type: 'array', maxItems: 100, items: { type: 'object', properties: offerProperties, required: Object.keys(offerProperties) } } } : {}) }, required: agent === 'sourcing' ? ['sku', 'offers'] : ['sku'] },
      execute: async (args: Record<string, unknown>, ctx: Parameters<AutomatonTool['execute']>[1]) => {
        if (typeof args.sku !== 'string' || !args.sku.trim()) throw new Error('Invalid sku');
        const store = new CommerceStore(ctx.db);
        return ctx.db.runTransaction(() => {
          const product = store.get(args.sku as string);
          const report = agent === 'margin' ? marginAgent(product) : agent === 'stock' ? stockAgent(product) : sourcingAgent(product, args.offers);
          store.report(agent, product.sku, report);
          return JSON.stringify(report);
        });
      },
    })),
  ];
}
