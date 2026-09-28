import { z } from 'zod';

export const API_ROOT = 'https://live-api.panta.market/api/v1';
export const SDK_VERSION = '1.5.13';
export const amountText = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,9})?$/).max(32);
const price = z.union([z.string().regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/).max(40), z.null()]);
export const marketSchema = z.object({
  marketId: z.string().min(1).max(100), category: z.string().max(100),
  title: z.string().max(500), description: z.string().max(15000),
  phase: z.enum(['primary', 'secondary', 'resolved', 'cancelled']),
  marketType: z.enum(['standard', 'breaking']),
  startTime: z.number().int().nonnegative(), endTime: z.number().int().nonnegative(),
  resolutionTime: z.number().int().nonnegative(), resolved: z.boolean(),
  region: z.string().max(200), status: z.string().max(100), volumeUsdc: amountText,
  yesPrice: price, noPrice: price,
  primaryYesPrice: price.optional(), primaryNoPrice: price.optional(),
  secondaryYesPrice: price.optional(), secondaryNoPrice: price.optional(),
  images: z.array(z.string().max(3000)).max(20).optional(),
  campaignId: z.string().nullable().optional(), createdByPartner: z.boolean().optional(),
});
export const tradeSchema = z.object({
  id: z.union([z.string().max(150), z.number().int()]), marketId: z.string().max(100),
  wallet: z.string().max(100), isPrimary: z.boolean(),
  yesAmount: z.union([amountText, z.number().finite().nonnegative()]),
  noAmount: z.union([amountText, z.number().finite().nonnegative()]),
  feePaid: z.union([amountText, z.number().finite().nonnegative()]),
  blockTime: z.number().int().nonnegative().nullable(), signature: z.string().max(150),
  quoteAsset: z.string().max(100),
});
// The documented terminal page may omit nextCursor entirely.
export const pageSchema = z.object({items: z.array(marketSchema).max(50), nextCursor: z.string().max(500).nullish().transform(v => v ?? null)});
export const tradesSchema = z.object({marketId: z.string(), items: z.array(tradeSchema).max(200)});
export type Market = z.infer<typeof marketSchema>;
export type Trade = z.infer<typeof tradeSchema>;

export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  provenance: z.object({mode: z.enum(['synthetic-fixture', 'live']), source: z.string().max(250),
    capturedAt: z.string().datetime(), complete: z.boolean(), pages: z.number().int().nonnegative(),
    notes: z.array(z.string().max(1000)).max(100)}),
  markets: z.array(z.object({market: marketSchema, trades: z.array(tradeSchema).max(200),
    detailAvailable: z.boolean(), tradesAvailable: z.boolean(), warnings: z.array(z.string().max(500)).max(10)})).max(500),
}).superRefine((snapshot, ctx) => {
  const ids = new Set<string>();
  snapshot.markets.forEach((row, i) => {
    if (ids.has(row.market.marketId)) ctx.addIssue({code: 'custom', path: ['markets', i], message: 'Duplicate market ID in snapshot.'});
    ids.add(row.market.marketId);
    if (row.trades.some(t => t.marketId !== row.market.marketId))
      ctx.addIssue({code: 'custom', path: ['markets', i, 'trades'], message: 'Trade market ID does not match its parent.'});
  });
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const launchSchema = z.object({
  schemaVersion: z.literal(1), name: z.string().min(1).max(120),
  anchorMarketId: z.string().min(1).max(100),
  purpose: z.string().min(20).max(2000),
  tokenSupply: z.number().int().min(1_000_000).max(1_000_000_000_000),
  initialMarketCap: z.number().finite().min(100).max(1_000_000_000),
  migrationMarketCap: z.number().finite().min(1000).max(100_000_000_000),
  tradingFeeBps: z.number().int().min(25).max(1000),
  quoteDecimals: z.literal(6), baseDecimals: z.literal(6), quoteUnit: z.literal('USDC'),
  budgets: z.object({yes: amountText, no: amountText}),
  probeAmounts: z.array(amountText).min(3).max(40),
  guardrails: z.object({maxPriceImpactPercent: z.number().min(0.1).max(1000),
    minVolumeUsdc: amountText, minRecentTrades: z.number().int().min(0).max(200),
    maxSnapshotAgeMinutes: z.number().min(1).max(1440), maxTradeAgeMinutes: z.number().min(1).max(10080),
    maxComplementGap: z.number().min(0).max(0.5)}),
}).superRefine((v, ctx) => {
  if (v.migrationMarketCap < 2 * v.initialMarketCap || v.migrationMarketCap > 10000 * v.initialMarketCap)
    ctx.addIssue({code: 'custom', path: ['migrationMarketCap'], message: 'Migration cap must be 2–10000 times initial cap.'});
  for (const [key, a] of [...Object.entries(v.budgets), ...v.probeAmounts.map((x, i) => [`probe ${i}`, x])]) {
    if (!a || Number(a) <= 0 || Number(a) > 1e9 || (a.split('.')[1]?.length ?? 0) > 6)
      ctx.addIssue({code: 'custom', path: ['budgets'], message: `${key} must be positive, <= 1 billion, and at most six decimal places.`});
  }
});
export type LaunchInput = z.infer<typeof launchSchema>;
