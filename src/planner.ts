import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { analyzeCurves, type CurveAnalysis } from './dbc.js';
import { assessEvidence, type Evidence } from './evidence.js';
import { launchSchema, snapshotSchema, SDK_VERSION, type LaunchInput, type Snapshot } from './schema.js';

export interface Gate {id: string; state: 'pass' | 'review' | 'blocked'; message: string;}
export interface Comparison {
  curveId: string; weightedTokenOutput: string | null; weightedMigrationProgressPercent: number | null;
  weightedUnspentUsdc: string | null; yesImpactPass: boolean; noImpactPass: boolean;
}
export interface Report {
  schemaVersion: 1; product: 'SignalForge'; generatedAt: string; runId: string;
  inputHash: string; snapshotHash: string; engine: {sdk: string; version: string};
  input: LaunchInput; provenance: Snapshot['provenance']; evidence: Evidence[];
  curves: CurveAnalysis[]; comparisons: Comparison[]; gates: Gate[];
  status: 'blocked' | 'review-required' | 'ready-for-human-review'; assumptions: string[];
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export function buildReport(rawInput: unknown, rawSnapshot: unknown, now = new Date()): Report {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid analysis timestamp.');
  const input = launchSchema.parse(rawInput); const snapshot = snapshotSchema.parse(rawSnapshot);
  const evidence = assessEvidence(snapshot, input, now);
  const anchor = evidence.find(e => e.marketId === input.anchorMarketId);
  const curves = analyzeCurves(input);
  const gates: Gate[] = [
    {id: 'data-provenance', state: snapshot.provenance.mode === 'live' ? 'pass' : 'review',
      message: snapshot.provenance.mode === 'live' ? 'Snapshot declares a live Panta capture. A local snapshot file is not independently authenticated.' : 'Synthetic demonstration data. No live API execution or demand validation is claimed.'},
    {id: 'market-evidence', state: anchor?.usable ? 'pass' : 'blocked',
      message: anchor ? (anchor.usable ? 'Anchor market passes configured data-quality checks.' : anchor.issues.join(' ')) : 'Anchor market was not found in this snapshot.'},
    {id: 'catalog-coverage', state: snapshot.provenance.complete ? 'pass' : 'review', message: snapshot.provenance.complete ? (snapshot.provenance.mode === 'live' ? 'Capture declares all requested catalog pages were collected.' : 'Complete supplied synthetic fixture; no catalog was queried.') : 'Collection was bounded; review coverage notes.'},
    {id: 'operator-review', state: 'review', message: 'Human review of event relevance, scenario budgets, quote mint, fees, and actual pool conditions is required.'},
  ];
  const weight = anchor?.usable ? anchor.yesWeight : null;
  const comparisons = curves.map(curve => {
    const mix = (field: 'tokenOutput' | 'unspentUsdc') => weight === null || weight === undefined ? null :
      new Decimal(curve.outcomes.yes[field]).mul(weight).plus(new Decimal(curve.outcomes.no[field]).mul(new Decimal(1).minus(weight))).toFixed(6);
    const yesImpactPass = (curve.outcomes.yes.grossPriceImpactPercent ?? Infinity) <= input.guardrails.maxPriceImpactPercent;
    const noImpactPass = (curve.outcomes.no.grossPriceImpactPercent ?? Infinity) <= input.guardrails.maxPriceImpactPercent;
    gates.push({id: `impact-${curve.id}`, state: yesImpactPass && noImpactPass ? 'pass' : 'review',
      message: `${curve.label}: ${yesImpactPass && noImpactPass ? 'both' : 'one or both'} conditional budgets ${yesImpactPass && noImpactPass ? 'stay within' : 'exceed'} the configured gross execution premium limit.`});
    return {curveId: curve.id, weightedTokenOutput: mix('tokenOutput'), weightedUnspentUsdc: mix('unspentUsdc'),
      weightedMigrationProgressPercent: weight === null || weight === undefined ? null :
        curve.outcomes.yes.migrationProgressPercent * weight + curve.outcomes.no.migrationProgressPercent * (1 - weight), yesImpactPass, noImpactPass};
  });
  const inputHash = fingerprint(input); const snapshotHash = fingerprint(snapshot);
  return {schemaVersion: 1, product: 'SignalForge', generatedAt: now.toISOString(),
    runId: fingerprint({inputHash, snapshotHash, now: now.toISOString(), sdk: SDK_VERSION}).slice(0, 16),
    inputHash, snapshotHash, engine: {sdk: '@meteora-ag/dynamic-bonding-curve-sdk', version: SDK_VERSION},
    input, provenance: snapshot.provenance, evidence, curves, comparisons, gates,
    status: gates.some(g => g.state === 'blocked') ? 'blocked' : gates.some(g => g.state === 'review') ? 'review-required' : 'ready-for-human-review',
    assumptions: [
      'YES/(YES+NO) is a normalized price-implied scenario weight, not a calibrated event probability or forecast of demand.',
      'YES and NO budgets are explicit user assumptions. Other markets are diagnostics only; no independence assumption or causal relationship is inferred.',
      'Every quote starts from an empty DBC pool, with six-decimal base and USDC-denominated quote amounts, fixed fees, and dynamic fees disabled.',
      'One millionth of total token supply, rounded up to whole tokens, is reserved as leftover for SDK integer rounding. Partner LP is permanently locked at 100%; token authority is immutable.',
      'Pool creation fee is zero in the diagnostic configuration. This does not imply an actual launch has zero network or protocol costs. SDK structural validation uses a nonzero local placeholder for the unassigned leftover recipient.',
      'SDK partial fills stop at migration. Unspent input is gross requested minus gross consumed. Post-migration AMM execution is not modeled.',
      'Gross execution premium compares average fill price including trading fees against the initial marginal price; it is not the SDK slippage tolerance.',
      'No pool is created. Configurations are analysis artifacts; quote mint validity, on-chain state, network costs and token economics need human verification.',
      'A recent trade sample and reported volume are not proof of organic activity. Wallet counts are descriptive, not unique-person counts.',
    ]};
}
