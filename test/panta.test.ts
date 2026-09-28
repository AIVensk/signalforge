import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PantaClient, PantaError } from '../src/panta.js';
import { fixture, KEY, MARKET_ID, NOW, response } from './helpers.js';

test('authenticated GET uses fixed origin and manual redirects, never a key in the URL', async () => {
  const client = new PantaClient({apiKey: KEY, fetch: async (url, init) => {
    const u = new URL(String(url)); assert.equal(u.origin, 'https://live-api.panta.market');
    assert.equal(u.searchParams.get('category'), 'climate & energy'); assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'manual'); assert.equal(new Headers(init?.headers).get('X-Api-Key'), KEY);
    assert.ok(!String(url).includes(KEY)); return response({items: [], nextCursor: null});
  }});
  assert.deepEqual(await client.list('climate & energy', 'primary'), {items: [], nextCursor: null});
});
test('redirects, malformed JSON, non-JSON and oversized bodies are rejected', async () => {
  for (const [result, code] of [
    [new Response(null, {status: 302, headers: {location: 'https://evil.example'}}), 'REDIRECT_REFUSED'],
    [new Response('{bad', {headers: {'content-type': 'application/json'}}), 'INVALID_RESPONSE_SCHEMA'],
    [new Response('<html>no</html>'), 'NON_JSON_RESPONSE'],
    [new Response('x'.repeat(2_000_001), {headers: {'content-type': 'application/json'}}), 'RESPONSE_TOO_LARGE'],
  ] as const) {
    const c = new PantaClient({apiKey: KEY, fetch: async () => result});
    await assert.rejects(c.list('crypto', 'primary'), (e: unknown) => e instanceof PantaError && e.code === code);
  }
});
test('bounded retry honors Retry-After on 429 and does not retry unauthorized reads', async () => {
  let calls = 0; const delays: number[] = [];
  const c = new PantaClient({apiKey: KEY, sleep: async ms => {delays.push(ms);}, fetch: async () => {
    calls++; return calls === 1 ? response({}, 429, {'retry-after': '2'}) : response({items: [], nextCursor: null});
  }});
  await c.list('crypto', 'primary'); assert.equal(calls, 2); assert.deepEqual(delays, [2000]);
  calls = 0;
  const bad = new PantaClient({apiKey: KEY, fetch: async () => {calls++; return response({message: KEY}, 401);}});
  await assert.rejects(bad.list('crypto', 'primary'), e => !String(e).includes(KEY)); assert.equal(calls, 1);
});
test('date Retry-After is interpreted against the clock; excessive waits fail closed', async () => {
  const delays: number[] = []; let calls = 0;
  const c = new PantaClient({apiKey: KEY, now: () => NOW, sleep: async ms => {delays.push(ms);}, fetch: async () => ++calls === 1 ?
    response({}, 429, {'retry-after': new Date(NOW.getTime() + 3000).toUTCString()}) : response({items: [], nextCursor: null})});
  await c.list('crypto', 'primary'); assert.deepEqual(delays, [3000]);
  const long = new PantaClient({apiKey: KEY, fetch: async () => response({}, 429, {'retry-after': '900'})});
  await assert.rejects(long.list('crypto', 'primary'), /RETRY_AFTER_TOO_LONG/);
});
test('catalog pagination deduplicates IDs and marks a repeated cursor as partial', async () => {
  const row = {...fixture().markets[0]!.market, marketId: MARKET_ID};
  let catalogCalls = 0;
  const c = new PantaClient({apiKey: KEY, now: () => NOW, sleep: async () => {}, fetch: async url => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/trades/')) return response({marketId: MARKET_ID, items: []});
    if (u.pathname.endsWith(`/${MARKET_ID}/`)) return response(row);
    catalogCalls++;
    return response({items: [{...row, yesPrice: null, noPrice: null}], nextCursor: u.searchParams.get('status') === 'primary' ? 'same-cursor' : null});
  }});
  const s = await c.collect('crypto', 3, 10);
  assert.equal(catalogCalls, 3); assert.equal(s.markets.length, 1); assert.equal(s.provenance.complete, false);
  assert.equal(s.markets[0]!.market.yesPrice, '0.64'); assert.equal(s.markets[0]!.detailAvailable, true);
  assert.ok(s.provenance.notes.some(n => n.includes('cycle'))); assert.ok(!JSON.stringify(s).includes(KEY));
});
test('bounded catalog pages and detail failures retain missing prices explicitly', async () => {
  const row = {...fixture().markets[0]!.market, marketId: MARKET_ID, yesPrice: null, noPrice: null};
  const c = new PantaClient({apiKey: KEY, retries: 0, sleep: async () => {}, now: () => NOW, fetch: async url => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/trades/')) return response({marketId: MARKET_ID, items: []});
    if (u.pathname.endsWith(`/${MARKET_ID}/`)) return response({}, 503);
    return response({items: [row], nextCursor: 'more'});
  }});
  const s = await c.collect('crypto', 1, 1);
  assert.equal(s.provenance.complete, false); assert.equal(s.markets[0]!.detailAvailable, false);
  assert.equal(s.markets[0]!.market.yesPrice, null); assert.deepEqual(s.markets[0]!.warnings, ['HTTP_ERROR']);
});
test('market IDs cannot alter URL paths, and trade endpoint identity must match', async () => {
  let calls = 0;
  const c = new PantaClient({apiKey: KEY, fetch: async () => {calls++; return response({marketId: 'other', items: []});}});
  await assert.rejects(c.market('../categories'), /INVALID_MARKET_ID/); assert.equal(calls, 0);
  await assert.rejects(c.trades(MARKET_ID), /MARKET_ID_MISMATCH/);
});
test('collection and credential inputs reject before network activity', async () => {
  assert.throws(() => new PantaClient({apiKey: 'arbitrary-token'}), /INVALID_API_KEY_FORMAT/);
  const c = new PantaClient({apiKey: KEY, fetch: async () => {throw new Error('should not call');}});
  await assert.rejects(c.collect('crypto', 0, 1), /INVALID_COLLECTION_LIMITS/);
  await assert.rejects(c.collect('crypto', 2, 101), /INVALID_COLLECTION_LIMITS/);
});
test('terminal catalog pages accept the documented omitted cursor', async () => {
  const c = new PantaClient({apiKey: KEY, fetch: async () => response({items: []})});
  assert.deepEqual(await c.list('crypto', 'primary'), {items: [], nextCursor: null});
});
test('single-market reads reject another market even when its schema is valid', async () => {
  const row = {...fixture().markets[0]!.market, marketId: 'AnotherMarket1111111111111111111111111111111'};
  const c = new PantaClient({apiKey: KEY, fetch: async () => response(row)});
  await assert.rejects(c.market(MARKET_ID), /MARKET_ID_MISMATCH/);
});
