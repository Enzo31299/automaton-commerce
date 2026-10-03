import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createDatabase, insertWakeEvent, consumeNextWakeEvent } from '../state/database.js';
import { runAgentLoop } from '../agent/loop.js';
import { PolicyEngine } from '../agent/policy-engine.js';
import { SpendTracker } from '../agent/spend-tracker.js';
import { createDefaultRules } from '../agent/policy-rules/index.js';
import { createHeartbeatDaemon } from '../heartbeat/daemon.js';
import { ModelRegistry } from '../inference/registry.js';
import { runCommerceBatch } from './run.js';
import { object } from './agents.js';
import type { AutomatonConfig, AutomatonIdentity, ConwayClient, InferenceClient, InferenceResponse } from '../types.js';

const MODEL = 'commerce-rules-v1';

/** No wallet is generated. Legacy account access fails instead of signing. */
function localIdentity(): AutomatonIdentity {
  return Object.defineProperty({ name: 'Automaton Commerce', address: 'commerce:local',
    creatorAddress: 'commerce:operator', sandboxId: 'commerce-local', apiKey: '',
    createdAt: new Date().toISOString() }, 'account', {
    get() { throw new Error('Wallet access is disabled in commerce'); },
  }) as AutomatonIdentity;
}

/** The shared interfaces remain compatible; every legacy operation fails closed. */
const disabledConway = new Proxy({} as ConwayClient, {
  get() { return () => { throw new Error('Conway operations are disabled in commerce'); }; },
});

/** Deterministic planning, not a language model or live supplier integration. */
function rulePlanner(skus: string[], offers: Record<string, unknown>, intervalSeconds: number): InferenceClient {
  const plan = [
    { name: 'commerce_catalogue_list', args: {} },
    ...skus.flatMap(sku => [
      { name: 'commerce_margin_analyse', args: { sku } },
      { name: 'commerce_stock_analyse', args: { sku } },
      { name: 'commerce_sourcing_analyse', args: { sku, offers: Object.hasOwn(offers, sku) ? offers[sku] : [] } },
    ]),
    { name: 'remember_fact', args: { category: 'domain', key: 'commerce_runtime_mode',
      value: 'Local rules analyse supplied evidence; shop writes and live supplier validation are disabled.', source: 'commerce-runtime' } },
    { name: 'sleep', args: { duration_seconds: intervalSeconds, reason: 'Commerce rule cycle complete' } },
  ];
  let index = 0;
  return {
    getDefaultModel: () => MODEL,
    setLowComputeMode: () => {},
    async chat(): Promise<InferenceResponse> {
      const step = plan[index++];
      if (!step) throw new Error('Rule plan exhausted');
      const call = { id: randomUUID(), type: 'function' as const,
        function: { name: step.name, arguments: JSON.stringify(step.args) } };
      return { id: randomUUID(), model: MODEL,
        message: { role: 'assistant', content: 'Run the next local commerce check.', tool_calls: [call] },
        toolCalls: [call], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'tool_calls' };
    },
  };
}

export async function runCommerceRuntime(input: unknown, dbPath: string, options: {
  once?: boolean; intervalSeconds?: number; signal?: AbortSignal;
} = {}): Promise<void> {
  const intervalSeconds = options.intervalSeconds ?? 3600;
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 86400) {
    throw new Error('Commerce interval must be between 60 and 86400 seconds');
  }
  if (options.signal?.aborted) return;
  const batch = object(input);
  if (!Array.isArray(batch.products) || batch.products.length < 1 || batch.products.length > 100) {
    throw new Error('Runtime accepts 1 to 100 fully costed products');
  }
  const db = createDatabase(dbPath);
  let heartbeat: ReturnType<typeof createHeartbeatDaemon> | undefined;
  try {
    const imported = runCommerceBatch(db, input);
    const skus = imported.results.map(r => r.product.sku);
    const offers = batch.offersBySku === undefined ? {} : object(batch.offersBySku);
    const config: AutomatonConfig = { runtimeProfile: 'commerce', name: 'Automaton Commerce',
      genesisPrompt: 'Analyse supplied commerce data; recommendations only.', creatorAddress: 'commerce:operator',
      registeredWithConway: false, sandboxId: 'commerce-local', conwayApiUrl: '', conwayApiKey: '',
      inferenceModel: MODEL, maxTokensPerTurn: 1024, heartbeatConfigPath: '', dbPath,
      logLevel: 'info', walletAddress: '', version: 'commerce-v1', skillsDir: '', maxChildren: 0,
      maxTurnsPerCycle: skus.length * 3 + 4 };
    const identity = localIdentity();
    const registry = new ModelRegistry(db.raw); registry.initialize();
    const now = new Date().toISOString();
    registry.upsert({ modelId: MODEL, provider: 'other', displayName: 'Local commerce rules',
      tierMinimum: 'normal', costPer1kInput: 0, costPer1kOutput: 0, maxTokens: 1024,
      contextWindow: 128000, supportsTools: true, supportsVision: false,
      parameterStyle: 'max_tokens', enabled: true, lastSeen: now, createdAt: now, updatedAt: now });
    const policyEngine = new PolicyEngine(db.raw, createDefaultRules());
    const spendTracker = new SpendTracker(db.raw);
    heartbeat = createHeartbeatDaemon({ identity, config, db, rawDb: db.raw, conway: disabledConway,
      onWakeRequest: reason => { insertWakeEvent(db.raw, 'heartbeat', reason); },
      heartbeatConfig: { defaultIntervalMs: 60000, lowComputeMultiplier: 1, entries: [
        { name: 'health_check', task: 'health_check', schedule: '*/5 * * * *', enabled: true },
        { name: 'commerce_catalogue_review', task: 'commerce_catalogue_review', schedule: '0 * * * *', enabled: true },
      ] } });
    // Once mode verifies health through the same daemon without background tasks.
    await heartbeat.forceRun('health_check');
    if (!options.once) heartbeat.start();
    do {
      let toolFailed = false;
      let completedCalls = 0;
      await runAgentLoop({ identity, config, db, conway: disabledConway,
        inference: rulePlanner(skus, offers, intervalSeconds), policyEngine, spendTracker,
        onTurnComplete: turn => {
          completedCalls += turn.toolCalls.length;
          if (turn.toolCalls.some(t => t.error)) toolFailed = true;
        } });
      if (toolFailed || completedCalls !== skus.length * 3 + 3) throw new Error('Commerce cycle incomplete; inspect local policy/turn reports');
      db.setKV('commerce:runtime_last_cycle', JSON.stringify({ mode: 'local-rules', timestamp: new Date().toISOString(), skus: skus.length, shopWrites: false }));
      if (options.once || options.signal?.aborted) break;
      await new Promise<void>(done => {
        const deadline = Date.now() + intervalSeconds * 1000;
        let timer: ReturnType<typeof setTimeout>;
        const finish = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', finish); done(); };
        const poll = () => {
          if (options.signal?.aborted || Date.now() >= deadline || consumeNextWakeEvent(db.raw)) finish();
          else timer = setTimeout(poll, 1000);
        };
        timer = setTimeout(poll, 1000);
        options.signal?.addEventListener('abort', finish, { once: true });
        if (options.signal?.aborted) finish();
      });
    } while (!options.signal?.aborted);
  } finally {
    heartbeat?.stop();
    await heartbeat?.drain?.();
    db.setAgentState('sleeping');
    db.close();
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length < 2 || args.length > 3 || (args[2] !== undefined && args[2] !== '--once')) {
    throw new Error('Usage: commerce-runtime <batch.json> <sqlite-path> [--once]');
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    await runCommerceRuntime(JSON.parse(readFileSync(resolve(args[0]), 'utf8')), resolve(args[1]),
      { once: args[2] === '--once', signal: controller.signal });
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Commerce runtime failed; inspect private local reports.'); process.exitCode = 1; });
}
