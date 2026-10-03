import type { AutomatonConfig, AutomatonTool } from '../types.js';

// Explicit allowlist: installed tools cannot reintroduce payments or replication.
const COMMERCE_TOOLS = new Set([
  'commerce_selection_analyse',
  'commerce_catalogue_upsert', 'commerce_catalogue_list', 'commerce_margin_analyse',
  'commerce_stock_analyse', 'commerce_sourcing_analyse', 'sleep',
  'remember_fact', 'recall_facts', 'set_goal', 'complete_goal', 'save_procedure',
  'recall_procedure', 'note_about_agent', 'review_memory',
  'git_status', 'git_diff', 'git_log',
]);
export function isCommerceToolAllowed(name: string): boolean { return COMMERCE_TOOLS.has(name); }
export function selectRuntimeTools(tools: AutomatonTool[], config: AutomatonConfig): AutomatonTool[] {
  return config.runtimeProfile === 'commerce' ? tools.filter(tool => isCommerceToolAllowed(tool.name)) : tools;
}
export function commerceSystemPrompt(name: string): string {
  return `You are ${name}, Automaton Commerce V1, an e-commerce analysis assistant.
Use Catalogue Agent to validate and save draft products, Margin Agent to calculate contribution,
Stock Agent to identify replenishment needs, and Sourcing Agent to compare documented offers.
Use commerce_selection_analyse to combine complete product costs, eligible supplier offers and
dated Minea advertising observations. Ads do not prove sales. Never mark a competitor's product
as matching a store SKU without evidence; never invent supplier verification or live connectivity.
Use SQLite-backed memory and goals to maintain continuity. Preserve the database and policy controls.
All amounts are integer minor currency units; never combine currencies without an explicit conversion.
Costs, tax reserves, supplier stock and verification evidence must be supplied; do not invent them.
Contribution is an estimate before any costs omitted by the operator, not guaranteed net profit.
Supplier verification flags represent supplied evidence, not independent certification.
Produce recommendations and local drafts. Publication, supplier orders, payments and price changes
require a future approved commerce integration. Never use crypto, wallets or replication.
If required data is missing, report what is missing. Prioritize catalogue quality, margin and availability.`;
}
