import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { ActivationType, BaseFeeMode, buildCurveWithLiquidityWeights, buildCurveWithMarketCap,
  CollectFeeMode, DynamicBondingCurveClient, getCurveBreakdown, getMigrationThresholdPrice,
  getPriceFromSqrtPrice, MigrationFeeOption, MigrationOption, SwapMode,
  TokenAuthorityOption, TokenDecimal, TokenType, validateConfigParameters, type BuildCurveBaseParams, type ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { SDK_VERSION, type LaunchInput } from './schema.js';

/** Decimal text to exact integer units, rejecting accidental precision loss. */
export function toUnits(value: string, decimals: number): BN {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 9)
    throw new Error('Invalid decimal amount.');
  const scaled = new Decimal(value).mul(new Decimal(10).pow(decimals));
  if (!scaled.isInteger() || scaled.gt('18446744073709551615')) throw new Error('Amount precision or u64 range exceeded.');
  return new BN(scaled.toFixed(0), 10);
}
export const fromUnits = (value: BN, decimals: number): string => new Decimal(value.toString(10)).div(new Decimal(10).pow(decimals)).toFixed();
export function plain(value: unknown): unknown {
  if (BN.isBN(value)) return value.toString(10);
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  return value;
}
export interface Quote {
  requestedUsdc: string; usedUsdc: string; unspentUsdc: string; curveInflowUsdc: string;
  tokenOutput: string; totalFeeUsdc: string; protocolFeeUsdc: string;
  averagePrice: string | null; terminalPrice: string; grossPriceImpactPercent: number | null;
  migrationProgressPercent: number; reachesMigration: boolean;
}
export interface CurveAnalysis {
  id: string; label: string; sdkVersion: string; initialPrice: string; migrationPrice: string;
  migrationQuoteThresholdUsdc: string; config: unknown;
  segments: {endPrice: string; tokenAmount: string}[];
  probes: Quote[]; outcomes: {yes: Quote; no: Quote};
}
const profiles = [
  {id: 'constant-liquidity', label: 'Constant liquidity', weights: null},
  {id: 'front-weighted', label: 'Front-weighted liquidity', weights: [4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]},
  {id: 'back-weighted', label: 'Back-weighted liquidity', weights: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]},
] as const;

function baseParams(input: LaunchInput): BuildCurveBaseParams {
  return {
    token: {tokenType: TokenType.SPLToken, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: 6,
      // The SDK weighted builder needs a positive rounding reserve when fitting integer liquidity.
      tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: input.tokenSupply, leftover: Math.ceil(input.tokenSupply / 1_000_000)},
    fee: {baseFeeParams: {baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: {startingFeeBps: input.tradingFeeBps, endingFeeBps: input.tradingFeeBps, numberOfPeriod: 0, totalDuration: 0}},
      dynamicFeeEnabled: false, collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0, poolCreationFee: 0, enableFirstSwapWithMinFee: false},
    migration: {migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: {feePercentage: 0, creatorFeePercentage: 0}},
    liquidityDistribution: {partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 100,
      creatorLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 0},
    lockedVesting: {totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0,
      totalVestingDuration: 0, cliffDurationFromMigrationTime: 0}, activationType: ActivationType.Timestamp,
  };
}

// These SDK methods are pure quote operations. The Connection cannot contact a network:
// even an accidental read fails through its injected fetch. No wallet, keypair, or send API is exposed.
const localClient = new DynamicBondingCurveClient(new Connection('http://127.0.0.1:8899', {
  commitment: 'confirmed', fetch: async () => { throw new Error('Network disabled in the simulation engine.'); },
}), 'confirmed');

function quote(config: ConfigParameters, amount: string): Quote {
  const requested = toUnits(amount, 6);
  const q = localClient.pool.getQuoteFromInputAmount({config, swapBaseForQuote: false,
    amountIn: requested, swapMode: SwapMode.PartialFill, slippageBps: 0,
    hasReferral: false, currentPoint: new BN(0), eligibleForFirstSwapWithMinFee: false});
  if (q.includedFeeInputAmount.gt(requested) || q.outputAmount.isNeg()) throw new Error('SDK quote invariant failed.');
  const used = fromUnits(q.includedFeeInputAmount, 6);
  const output = fromUnits(q.outputAmount, 6);
  const initial = getPriceFromSqrtPrice(config.sqrtStartPrice, 6, 6);
  const average = new Decimal(output).isZero() ? null : new Decimal(used).div(output);
  const threshold = config.migrationQuoteThreshold;
  const migrationPrice = getMigrationThresholdPrice(threshold, config.sqrtStartPrice, config.curve);
  return {
    requestedUsdc: amount, usedUsdc: used,
    // SDK amountLeft is after a preliminary fee calculation; this exact difference is the user's unused gross input.
    unspentUsdc: fromUnits(requested.sub(q.includedFeeInputAmount), 6),
    curveInflowUsdc: fromUnits(q.excludedFeeInputAmount, 6), tokenOutput: output,
    totalFeeUsdc: fromUnits(q.tradingFee.add(q.protocolFee).add(q.referralFee), 6),
    protocolFeeUsdc: fromUnits(q.protocolFee, 6), averagePrice: average?.toFixed(12) ?? null,
    terminalPrice: getPriceFromSqrtPrice(q.nextSqrtPrice, 6, 6).toFixed(12),
    grossPriceImpactPercent: average ? average.div(initial).minus(1).mul(100).toNumber() : null,
    migrationProgressPercent: Math.min(100, new Decimal(q.excludedFeeInputAmount.toString()).div(threshold.toString()).mul(100).toNumber()),
    reachesMigration: q.nextSqrtPrice.gte(migrationPrice),
  };
}

/** Each quote starts from the same empty pool. It is not a sequence or a liquidity forecast. */
export function analyzeCurves(input: LaunchInput): CurveAnalysis[] {
  return profiles.map(profile => {
    const args = {...baseParams(input), initialMarketCap: input.initialMarketCap, migrationMarketCap: input.migrationMarketCap};
    const config = profile.weights ? buildCurveWithLiquidityWeights({...args, liquidityWeights: [...profile.weights]}) : buildCurveWithMarketCap(args);
    // SDK validation requires a nonzero leftover recipient. This local placeholder is never exported
    // or used to build a transaction; any actual launch must choose and verify its own recipient.
    validateConfigParameters({...config, leftoverReceiver: new PublicKey(new Uint8Array(32).fill(1))});
    const breakdown = getCurveBreakdown(config.migrationQuoteThreshold, config.sqrtStartPrice, config.curve);
    return {id: profile.id, label: profile.label, sdkVersion: SDK_VERSION,
      initialPrice: getPriceFromSqrtPrice(config.sqrtStartPrice, 6, 6).toFixed(12),
      migrationPrice: getPriceFromSqrtPrice(breakdown.finalSqrtPrice, 6, 6).toFixed(12),
      migrationQuoteThresholdUsdc: fromUnits(config.migrationQuoteThreshold, 6), config: plain(config),
      segments: breakdown.segmentAmounts.map((a, i) => ({tokenAmount: fromUnits(a, 6),
        endPrice: getPriceFromSqrtPrice(config.curve[i]!.sqrtPrice, 6, 6).toFixed(12)})),
      probes: [...new Set(input.probeAmounts)].sort((a, b) => new Decimal(a).cmp(b)).map(a => quote(config, a)),
      outcomes: {yes: quote(config, input.budgets.yes), no: quote(config, input.budgets.no)}};
  });
}
