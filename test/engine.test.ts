import { test } from 'node:test';
import assert from 'node:assert/strict';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { analyzeCurves, toUnits, fromUnits } from '../src/dbc.js';
import { buildReport, fingerprint } from '../src/planner.js';
import { assessEvidence } from '../src/evidence.js';
import { launchSchema, snapshotSchema } from '../src/schema.js';
import { renderHtml, renderCsv } from '../src/render.js';
import { fixture, launch, NOW } from './helpers.js';

test('decimal conversion is exact, including values unsafe as JavaScript integers', () => {
  assert.equal(toUnits('1234567890.123456', 6).toString(), '1234567890123456');
  assert.equal(fromUnits(new BN('18446744073709551615'), 6), '18446744073709.551615');
  assert.throws(() => toUnits('0.0000001', 6), /precision/);
  assert.throws(() => toUnits('18446744073710', 6), /range/);
  assert.throws(() => toUnits('-1', 6), /Invalid/);
  assert.throws(() => launchSchema.parse({...launch(), budgets: {yes: '0', no: '1'}}));
});
test('actual SDK curves conserve gross input, fees, and unused budget; probes are monotonic', () => {
  for (const c of analyzeCurves(launch())) {
    let previousOut = new Decimal(0), previousPrice = new Decimal(0);
    for (const q of c.probes) {
      assert.ok(new Decimal(q.usedUsdc).plus(q.unspentUsdc).eq(q.requestedUsdc));
      assert.ok(new Decimal(q.curveInflowUsdc).plus(q.totalFeeUsdc).eq(q.usedUsdc));
      assert.ok(new Decimal(q.tokenOutput).gte(previousOut));
      assert.ok(new Decimal(q.terminalPrice).gte(previousPrice));
      assert.ok(q.migrationProgressPercent >= 0 && q.migrationProgressPercent <= 100);
      assert.ok(new Decimal(q.tokenOutput).lte(launch().tokenSupply));
      if (q.reachesMigration) assert.ok(new Decimal(q.terminalPrice).minus(c.migrationPrice).abs().lt('0.000000000002'));
      previousOut = new Decimal(q.tokenOutput); previousPrice = new Decimal(q.terminalPrice);
    }
    assert.ok(c.probes.at(-1)!.reachesMigration); assert.ok(Number(c.probes.at(-1)!.unspentUsdc) > 0);
  }
});
test('first segment quote agrees with independent integer constant-liquidity equations', () => {
  const c = analyzeCurves(launch())[0]!;
  const config = c.config as {sqrtStartPrice: string; curve: {liquidity: string}[]};
  const q = c.probes[0]!; const start = BigInt(config.sqrtStartPrice); const liquidity = BigInt(config.curve[0]!.liquidity);
  const net = BigInt(toUnits(q.curveInflowUsdc, 6).toString());
  const next = start + ((net << 128n) / liquidity);
  const output = liquidity * (next - start) / (start * next);
  assert.equal(toUnits(q.tokenOutput, 6).toString(), output.toString());
});
test('different caps and fees remain valid across an input matrix', () => {
  for (const cap of [2000, 20000, 200000]) for (const fee of [25, 300]) {
    const input = launchSchema.parse({...launch(), initialMarketCap: cap, migrationMarketCap: cap * 10, tradingFeeBps: fee});
    const curves = analyzeCurves(input);
    assert.equal(curves.length, 3);
    for (const c of curves) {
      assert.ok(Number(c.migrationQuoteThresholdUsdc) > 0);
      assert.ok(Number(c.migrationPrice) > Number(c.initialPrice));
      assert.ok(c.outcomes.yes.grossPriceImpactPercent !== null);
    }
  }
});
test('thin, stale and null-price fixtures fail evidence checks while the anchor passes', () => {
  const rows = assessEvidence(fixture(), launch(), NOW);
  assert.equal(rows[0]!.usable, true); assert.equal(rows[1]!.usable, false); assert.equal(rows[2]!.usable, false);
  assert.equal(rows[2]!.yesWeight, null); assert.ok(rows[1]!.issues.some(x => x.includes('complement')));
  assert.ok(Math.abs(rows[0]!.yesWeight! + rows[0]!.noWeight! - 1) < 1e-12);
});
test('stale, future, resolved and missing anchors block weighted results', () => {
  for (const mode of ['stale', 'future', 'resolved', 'missing'] as const) {
    const s = fixture(); const input = launch();
    if (mode === 'stale') s.provenance.capturedAt = '2026-09-27T16:00:00Z';
    if (mode === 'future') s.provenance.capturedAt = '2026-09-29T16:00:00Z';
    if (mode === 'resolved') s.markets[0]!.market.resolved = true;
    if (mode === 'missing') input.anchorMarketId = 'absent';
    const r = buildReport(input, s, NOW); assert.equal(r.status, 'blocked');
    assert.ok(r.comparisons.every(c => c.weightedTokenOutput === null));
    assert.equal(r.curves.length, 3, 'physical stress tests remain available even with unusable market evidence');
  }
});
test('duplicate trades cannot inflate the recent count, future activity is withheld', () => {
  const s = fixture(); const row = s.markets[0]!; row.trades = Array(100).fill(row.trades[0]);
  const e = assessEvidence(s, launch(), NOW)[0]!; assert.equal(e.tradeCount, 1); assert.equal(e.usable, false);
  row.trades[0]!.blockTime = NOW.getTime() / 1000 + 3600;
  assert.ok(assessEvidence(s, launch(), NOW)[0]!.issues.some(i => i.includes('future')));
});
test('snapshot identity checks reject duplicated markets and mixed-market trade tapes', () => {
  const s = fixture(); s.markets[0]!.trades[0]!.marketId = 'different';
  assert.throws(() => snapshotSchema.parse(s));
  const duplicate = fixture(); duplicate.markets.push(duplicate.markets[0]!);
  assert.throws(() => snapshotSchema.parse(duplicate));
});
test('replay is deterministic, key order is irrelevant, altered inputs change run identity', () => {
  const a = buildReport(launch(), fixture(), NOW); const b = buildReport(launch(), fixture(), NOW);
  assert.deepEqual(a, b); assert.equal(fingerprint({b: 2, a: 1}), fingerprint({a: 1, b: 2}));
  const input = launch(); input.budgets.yes = '50000'; assert.notEqual(buildReport(input, fixture(), NOW).runId, a.runId);
});
test('HTML is self-contained, fixtures are conspicuous, external titles are escaped, CSV is numeric only', () => {
  const s = fixture(); s.markets[0]!.market.title = '</script><img src=x onerror="alert(1)">';
  const r = buildReport(launch(), s, NOW); const html = renderHtml(r);
  assert.ok(html.includes('SYNTHETIC DEMONSTRATION')); assert.ok(html.includes('Powered by Panta'));
  assert.ok(html.includes('&lt;/script&gt;&lt;img')); assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script src=')); assert.ok(html.includes('data-chart="price"'));
  const csv = renderCsv(r); assert.equal(csv.trim().split('\r\n').length, 43); assert.ok(!csv.includes('onerror'));
});
test('synthetic fixture provenance does not claim a successful API collection', () => {
  const r = buildReport(launch(), fixture(), NOW);
  assert.ok(r.gates.find(g => g.id === 'catalog-coverage')!.message.includes('no catalog was queried'));
  assert.equal(r.gates.find(g => g.id === 'data-provenance')!.state, 'review');
  const s = fixture(); s.provenance.mode = 'live';
  assert.ok(buildReport(launch(), s, NOW).gates.find(g => g.id === 'data-provenance')!.message.includes('not independently authenticated'));
});
