import { shopDomain } from './shopify.js';

/** Server-only credentials. Never persist tokens or include upstream errors in logs. */
export function shopifyTokenProvider(
  domain: string,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
  now: () => number = Date.now,
  permission: 'read' | 'draft-write' = 'read',
): () => Promise<string> {
  shopDomain(domain);
  const token = env.SHOPIFY_ACCESS_TOKEN;
  const clientId = env.SHOPIFY_CLIENT_ID;
  const secret = env.SHOPIFY_CLIENT_SECRET;
  const valid = (value: string | undefined): value is string => !!value && !/\s/.test(value);
  if (token && (clientId || secret)) throw new Error('Choose one Shopify authentication mode');
  if (token) {
    if (!valid(token)) throw new Error('Invalid Shopify access token');
    return async () => token;
  }
  if (!valid(clientId) || !valid(secret)) throw new Error('Set SHOPIFY_ACCESS_TOKEN or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET securely');
  let cached: { token: string; refreshAt: number } | undefined;
  let pending: Promise<string> | undefined;
  async function exchange(): Promise<string> {
    const started = now();
    try {
      const response = await request(`https://${domain}/admin/oauth/access_token`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId!, client_secret: secret! }).toString(),
      });
      if (!response.ok) throw new Error('Authentication rejected');
      const body = await response.json();
      if (!body || typeof body !== 'object' || !valid(body.access_token) || typeof body.scope !== 'string'
        || !Number.isSafeInteger(body.expires_in) || body.expires_in <= 60 || body.expires_in > 86400) throw new Error('Invalid token response');
      const scopes = new Set<string>(body.scope.split(',').map((scope: string) => scope.trim()));
      const accepted = permission === 'read'
        ? scopes.size === 1 && scopes.has('read_products')
        : scopes.has('write_products') && scopes.has('read_inventory') && [...scopes].every(scope => ['read_products', 'write_products', 'read_inventory'].includes(scope));
      if (!accepted) throw new Error('Unexpected permissions');
      const refreshAt = started + (body.expires_in - 60) * 1000;
      if (now() >= refreshAt) throw new Error('Token already expired');
      cached = { token: body.access_token, refreshAt };
      return cached.token;
    } catch {
      cached = undefined;
      throw new Error('Shopify authentication failed. Verify installation, organization, required product scopes and server credentials');
    }
  }
  return async () => {
    if (cached && now() < cached.refreshAt) return cached.token;
    if (!pending) pending = exchange().finally(() => { pending = undefined; });
    return pending;
  };
}
