import { Decimal } from 'decimal.js';
import type { LaunchInput, Snapshot } from './schema.js';

export interface Evidence {
  marketId: string; title: string; phase: string; volumeUsdc: string;
  yesPrice: string | null; noPrice: string | null; yesWeight: number | null; noWeight: number | null;
  complementGap: number | null; tradeCount: number; recentTradeCount: number;
  uniqueWallets: number; lastTradeAt: string | null; snapshotAgeMinutes: number;
  usable: boolean; issues: string[];
}
export function assessEvidence(snapshot: Snapshot, input: LaunchInput, now: Date): Evidence[] {
  const age = (now.getTime() - Date.parse(snapshot.provenance.capturedAt)) / 60000;
  return snapshot.markets.map(({market: m, trades, detailAvailable, tradesAvailable, warnings}) => {
    const issues = [...warnings]; const g = input.guardrails;
    if (!detailAvailable) issues.push('Live detail was unavailable; catalog prices are not evidence.');
    if (!tradesAvailable) issues.push('Recent trade sample was unavailable.');
    if (m.resolved || !['primary', 'secondary'].includes(m.phase)) issues.push('Market is not trading.');
    if (m.endTime <= now.getTime() / 1000) issues.push('Market trading deadline has passed.');
    if (m.startTime > now.getTime() / 1000) issues.push('Market has not started.');
    if (age > g.maxSnapshotAgeMinutes) issues.push('Snapshot exceeds freshness limit.');
    if (age < -1) issues.push('Snapshot timestamp is in the future.');
    if (new Decimal(m.volumeUsdc).lessThan(g.minVolumeUsdc)) issues.push('Reported market volume is below the configured floor.');
    const validTrades = [...new Map(trades.map(t => [String(t.id), t])).values()];
    const times = validTrades.map(t => t.blockTime).filter((t): t is number => t !== null && t <= now.getTime() / 1000);
    const last = times.length ? Math.max(...times) : null;
    const recent = times.filter(t => now.getTime() / 1000 - t <= g.maxTradeAgeMinutes * 60).length;
    if (validTrades.some(t => t.blockTime !== null && t.blockTime > now.getTime() / 1000)) issues.push('Trade sample contains future timestamps.');
    if (recent < g.minRecentTrades) issues.push('Too few recent trades for the configured evidence floor.');
    let yesWeight: number | null = null; let noWeight: number | null = null; let complementGap: number | null = null;
    if (m.yesPrice === null || m.noPrice === null) issues.push('A price is missing; null is never treated as zero.');
    else {
      const yes = new Decimal(m.yesPrice); const no = new Decimal(m.noPrice); const sum = yes.plus(no);
      if (yes.gt(1) || no.gt(1) || sum.eq(0)) issues.push('Outcome prices are outside usable bounds.');
      else {
        complementGap = sum.minus(1).abs().toNumber();
        if (complementGap > g.maxComplementGap) issues.push('YES/NO complement gap exceeds the configured tolerance.');
        else { yesWeight = yes.div(sum).toNumber(); noWeight = no.div(sum).toNumber(); }
      }
    }
    return {marketId: m.marketId, title: m.title, phase: m.phase, volumeUsdc: m.volumeUsdc,
      yesPrice: m.yesPrice, noPrice: m.noPrice, yesWeight, noWeight, complementGap,
      tradeCount: validTrades.length, recentTradeCount: recent, uniqueWallets: new Set(validTrades.map(t => t.wallet)).size,
      lastTradeAt: last === null ? null : new Date(last * 1000).toISOString(), snapshotAgeMinutes: age,
      usable: issues.length === 0, issues};
  });
}
