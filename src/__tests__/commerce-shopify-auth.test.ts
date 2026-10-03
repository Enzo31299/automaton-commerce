import { describe, expect, it, vi } from 'vitest';
import { shopifyTokenProvider } from '../commerce/shopify-auth.js';
const env = { SHOPIFY_CLIENT_ID: 'test-client', SHOPIFY_CLIENT_SECRET: 'test-secret' };
const response = (extra = {}) => new Response(JSON.stringify({ access_token: 'test-token', scope: 'read_products', expires_in: 86399, ...extra }));
describe('Shopify server authentication security', () => {
  it('exchanges only at the validated shop, shares concurrent work and refreshes before expiry', async () => {
    let now = 0;
    const request = vi.fn().mockImplementation(async () => response());
    const get = shopifyTokenProvider('test.myshopify.com', env, request, () => now);
    expect(await Promise.all([get(), get()])).toEqual(['test-token', 'test-token']);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://test.myshopify.com/admin/oauth/access_token');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(new URLSearchParams(options.body as string).get('client_secret')).toBe('test-secret');
    now = (86399 - 61) * 1000; await get(); expect(request).toHaveBeenCalledTimes(1);
    now += 1000; await get(); expect(request).toHaveBeenCalledTimes(2);
  });
  it('supports existing tokens without network requests', async () => {
    const request = vi.fn();
    expect(await shopifyTokenProvider('test.myshopify.com', { SHOPIFY_ACCESS_TOKEN: 'test-static' }, request)()).toBe('test-static');
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects foreign domains, partial credentials and ambiguous modes before requests', () => {
    const request = vi.fn();
    for (const bad of [{}, { SHOPIFY_CLIENT_ID: 'test' }, { ...env, SHOPIFY_ACCESS_TOKEN: 'test' }]) {
      expect(() => shopifyTokenProvider('test.myshopify.com', bad, request)).toThrow();
    }
    expect(() => shopifyTokenProvider('attacker.example', env, request)).toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it.each([{ scope: 'write_products,read_products' }, { scope: 'read_orders' }, { expires_in: 0 }, { access_token: 'bad token' }])('fails closed on malformed or broader permission response %j', async extra => {
    await expect(shopifyTokenProvider('test.myshopify.com', env, vi.fn().mockResolvedValue(response(extra)))()).rejects.toThrow('Shopify authentication failed');
  });
  it('sanitizes network and upstream errors and allows a later retry', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('test-secret')).mockResolvedValueOnce(response());
    const get = shopifyTokenProvider('test.myshopify.com', env, request);
    await expect(get()).rejects.toThrow('Shopify authentication failed');
    expect(await get()).toBe('test-token');
    const failed = shopifyTokenProvider('test.myshopify.com', env, vi.fn().mockResolvedValue(new Response('test-secret', { status: 401 })));
    await expect(failed()).rejects.not.toThrow('test-secret');
  });
});
