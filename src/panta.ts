import { z } from 'zod';
import { API_ROOT, pageSchema, marketSchema, tradesSchema, type Market, type Snapshot } from './schema.js';

export class PantaError extends Error {
  constructor(public readonly code: string, public readonly status?: number) {
    super(`Panta read failed: ${code}${status ? ` (HTTP ${status})` : ''}`); this.name = 'PantaError';
  }
}
export interface PantaOptions {
  apiKey: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>;
  now?: () => Date; retries?: number; timeoutMs?: number;
}
/** Authenticated reads only. Fixed origin and manual redirects prevent credential forwarding. */
export class PantaClient {
  private readonly fetcher: typeof fetch;
  private readonly sleeper: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly retries: number;
  constructor(private readonly options: PantaOptions) {
    if (!/^pk_(test|live)_[A-Za-z0-9_-]{8,}$/.test(options.apiKey)) throw new PantaError('INVALID_API_KEY_FORMAT');
    this.fetcher = options.fetch ?? fetch;
    this.sleeper = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    this.now = options.now ?? (() => new Date());
    this.retries = Math.max(0, Math.min(3, options.retries ?? 2));
  }
  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(`${API_ROOT}${path}`, {method: 'GET', redirect: 'manual',
          headers: {'X-Api-Key': this.options.apiKey, Accept: 'application/json'},
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000)});
      } catch { throw new PantaError('NETWORK_OR_TIMEOUT'); }
      if (response.status >= 300 && response.status < 400) throw new PantaError('REDIRECT_REFUSED', response.status);
      if ((response.status === 429 || response.status >= 500) && attempt < this.retries) {
        const raw = response.headers.get('retry-after');
        const delay = raw ? (/^\d+(\.\d+)?$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - this.now().getTime()) : 500 * 2 ** attempt;
        if (!Number.isFinite(delay) || delay > 30_000) throw new PantaError('RETRY_AFTER_TOO_LONG', response.status);
        await response.body?.cancel();
        await this.sleeper(Math.max(0, delay)); continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new PantaError('HTTP_ERROR', response.status); }
      if (!(response.headers.get('content-type') ?? '').includes('json')) { await response.body?.cancel(); throw new PantaError('NON_JSON_RESPONSE'); }
      const reader = response.body?.getReader();
      if (!reader) throw new PantaError('EMPTY_RESPONSE');
      let bytes = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const next = await reader.read(); if (next.done) break;
        bytes += next.value.length;
        if (bytes > 2_000_000) { await reader.cancel(); throw new PantaError('RESPONSE_TOO_LARGE'); }
        chunks.push(next.value);
      }
      try { return schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { throw new PantaError('INVALID_RESPONSE_SCHEMA'); }
    }
    throw new PantaError('RETRIES_EXHAUSTED');
  }
  async list(category: string, status: 'primary' | 'secondary', cursor?: string) {
    const q = new URLSearchParams({category, status, limit: '50'}); if (cursor) q.set('cursor', cursor);
    return this.get(`/markets/?${q}`, pageSchema);
  }
  private checkId(id: string) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) throw new PantaError('INVALID_MARKET_ID');
  }
  async market(id: string) {
    this.checkId(id);
    const result = await this.get(`/markets/${encodeURIComponent(id)}/`, marketSchema);
    if (result.marketId !== id) throw new PantaError('MARKET_ID_MISMATCH');
    return result;
  }
  async trades(id: string) {
    this.checkId(id);
    const result = await this.get(`/markets/${encodeURIComponent(id)}/trades/?limit=200`, tradesSchema);
    if (result.marketId !== id || result.items.some(t => t.marketId !== id)) throw new PantaError('MARKET_ID_MISMATCH');
    return result.items;
  }
  /** Bounded pagination is explicit in provenance; no claim of complete coverage on a cap or cycle. */
  async collect(category = 'crypto', maxPages = 3, maxMarkets = 30): Promise<Snapshot> {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10 || !Number.isInteger(maxMarkets) || maxMarkets < 1 || maxMarkets > 100)
      throw new PantaError('INVALID_COLLECTION_LIMITS');
    const capturedAt = this.now().toISOString();
    const rows = new Map<string, Market>(); const notes: string[] = []; let pages = 0; let complete = true;
    for (const status of ['primary', 'secondary'] as const) {
      if (pages) await this.sleeper(550);
      let cursor: string | undefined; const cursors = new Set<string>();
      for (let p = 0; p < maxPages; p++) {
        const page = await this.list(category, status, cursor); pages++;
        for (const row of page.items) rows.set(row.marketId, row);
        if (!page.nextCursor) break;
        if (cursors.has(page.nextCursor)) { notes.push(`Cursor cycle in ${status}; collection stopped.`); complete = false; break; }
        cursors.add(page.nextCursor); cursor = page.nextCursor;
        if (p === maxPages - 1) { notes.push(`Page limit reached in ${status}.`); complete = false; }
        await this.sleeper(550);
      }
    }
    if (rows.size > maxMarkets) { complete = false; notes.push(`Details capped at ${maxMarkets} of ${rows.size} catalog markets.`); }
    const markets: Snapshot['markets'] = [];
    for (const row of [...rows.values()].slice(0, maxMarkets)) {
      let market = row; let detailAvailable = false; let tradesAvailable = false;
      let trades: Snapshot['markets'][number]['trades'] = []; const warnings: string[] = [];
      try {
        await this.sleeper(550); market = await this.market(row.marketId);
        detailAvailable = true;
      } catch (e) { market = row; warnings.push(e instanceof PantaError ? e.code : 'DETAIL_READ_FAILED'); }
      try { await this.sleeper(550); trades = await this.trades(row.marketId); tradesAvailable = true; }
      catch (e) { warnings.push(e instanceof PantaError ? e.code : 'TRADE_READ_FAILED'); }
      markets.push({market, trades, detailAvailable, tradesAvailable, warnings});
    }
    notes.push('Trade endpoint returns a bounded recent sample, not complete historical volume.');
    notes.push('capturedAt is the collection start time, so freshness checks conservatively include collection latency.');
    return {schemaVersion: 1, provenance: {mode: 'live', source: API_ROOT, capturedAt, complete, pages, notes}, markets};
  }
}
