#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { PantaClient, PantaError } from './panta.js';
import { buildReport, fingerprint, type Report } from './planner.js';
import { renderCsv, renderHtml } from './render.js';
import { snapshotSchema, launchSchema } from './schema.js';

const HELP = `SignalForge — read-only launch readiness workbench
Powered by Panta · Meteora DBC SDK

  signalforge demo --out artifacts/demo
  signalforge analyze --launch examples/energy-launch.json --snapshot snapshot.json --out artifacts/run
  signalforge capture --category crypto --pages 3 --max-markets 30 --out artifacts/live
  signalforge verify --report artifacts/demo/report.json --launch artifacts/demo/launch.json --snapshot artifacts/demo/snapshot.json
  signalforge compare --before artifacts/a/report.json --after artifacts/b/report.json

capture requires PANTA_API_KEY in the environment and an existing authorized Panta account.
It performs bounded GET reads; no commands sign, trade, create pools, register, or accept terms.
analyze uses the current time by default; --at ISO_TIMESTAMP explicitly replays historical evidence.
demo uses a fixed fixture timestamp for deterministic output and makes zero network requests.
`;
async function readJson(path: string): Promise<unknown> {
  if ((await stat(path)).size > 10_000_000) throw new Error('Input file exceeds 10 MB limit.');
  return JSON.parse(await readFile(path, 'utf8'));
}
async function atomicJson(path: string, value: unknown) { await atomic(path, JSON.stringify(value, null, 2) + '\n'); }
async function atomic(path: string, content: string) {
  await mkdir(dirname(path), {recursive: true});
  const temp = `${path}.tmp-${process.pid}`; await writeFile(temp, content, {encoding: 'utf8', mode: 0o600}); await rename(temp, path);
}
async function exportReport(out: string, report: Report, snapshot: unknown) {
  await mkdir(out, {recursive: true});
  await atomicJson(join(out, 'report.json'), report);
  await atomicJson(join(out, 'launch.json'), report.input);
  await atomicJson(join(out, 'snapshot.json'), snapshot);
  await atomic(join(out, 'report.html'), renderHtml(report));
  await atomic(join(out, 'quotes.csv'), renderCsv(report));
  for (const curve of report.curves) await atomicJson(join(out, `config-${curve.id}.json`), {
    disclaimer: 'Analysis only. BN fields are decimal strings. Rebuild from launch.json using the pinned SDK, do not pass this JSON directly to transaction methods.',
    sdk: report.engine, inputHash: report.inputHash, curve: curve.id, config: curve.config,
  });
}
async function main() {
  const {values: v, positionals} = parseArgs({allowPositionals: true, options: {
    out: {type: 'string'}, launch: {type: 'string'}, snapshot: {type: 'string'}, category: {type: 'string'},
    pages: {type: 'string'}, 'max-markets': {type: 'string'}, at: {type: 'string'}, report: {type: 'string'},
    before: {type: 'string'}, after: {type: 'string'}, help: {type: 'boolean', short: 'h'},
  }});
  const command = positionals[0];
  if (v.help || !command) { console.log(HELP); return; }
  if (positionals.length > 1) throw new Error('Unexpected positional arguments. Use --help.');
  const requireOption = (key: keyof typeof v): string => { const value = v[key]; if (typeof value !== 'string' || !value) throw new Error(`--${key} is required.`); return value; };
  if (command === 'capture') {
    const apiKey = process.env.PANTA_API_KEY;
    if (!apiKey) throw new Error('Set PANTA_API_KEY in your environment. No credentials are bundled.');
    const out = resolve(requireOption('out'));
    const client = new PantaClient({apiKey});
    const snapshot = await client.collect(v.category ?? 'crypto', Number(v.pages ?? 3), Number(v['max-markets'] ?? 30));
    await atomicJson(join(out, 'snapshot.json'), snapshotSchema.parse(snapshot));
    console.log(`Powered by Panta — captured ${snapshot.markets.length} markets across ${snapshot.provenance.pages} pages. Coverage ${snapshot.provenance.complete ? 'complete for requested statuses/category' : 'partial'}.\n${join(out, 'snapshot.json')}`);
    return;
  }
  if (command === 'demo' || command === 'analyze') {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const input = await readJson(command === 'demo' ? join(root, 'examples/energy-launch.json') : requireOption('launch'));
    const snapshot = snapshotSchema.parse(await readJson(command === 'demo' ? join(root, 'fixtures/panta-synthetic.json') : requireOption('snapshot')));
    const now = new Date(v.at ?? (command === 'demo' ? snapshot.provenance.capturedAt : Date.now()));
    const report = buildReport(input, snapshot, now);
    const out = resolve(v.out ?? 'artifacts/run'); await exportReport(out, report, snapshot);
    console.log(`SignalForge ${report.runId} — ${report.status}\nPowered by Panta · ${report.provenance.mode} · Meteora SDK ${report.engine.version}\n${join(out, 'report.html')}`);
    return;
  }
  if (command === 'verify') {
    const saved = await readJson(requireOption('report')) as Report;
    const rebuilt = buildReport(await readJson(requireOption('launch')), await readJson(requireOption('snapshot')), new Date(saved.generatedAt));
    if (fingerprint(saved) !== fingerprint(rebuilt)) throw new Error('Verification failed: report differs from replayed inputs or engine.');
    console.log(`Verified ${rebuilt.runId}: full report replay matches, including config and quote outputs.`); return;
  }
  if (command === 'compare') {
    const before = await readJson(requireOption('before')) as Report; const after = await readJson(requireOption('after')) as Report;
    // Revalidate user-provided launch inputs before accessing scenario values.
    launchSchema.parse(before.input); launchSchema.parse(after.input);
    const summary = {before: before.runId, after: after.runId, inputChanged: before.inputHash !== after.inputHash,
      snapshotChanged: before.snapshotHash !== after.snapshotHash, status: {before: before.status, after: after.status},
      anchor: [before, after].map(r => r.evidence.find(e => e.marketId === r.input.anchorMarketId) ?? null),
      comparisons: {before: before.comparisons, after: after.comparisons}};
    console.log(JSON.stringify(summary, null, 2)); return;
  }
  throw new Error(`Unknown command. Use --help.`);
}
main().catch(error => {
  const message = error instanceof z.ZodError ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') :
    error instanceof PantaError ? error.message : error instanceof Error ? error.message : 'Unexpected failure.';
  // Defense in depth for future errors that may accidentally interpolate an environment key.
  const key = process.env.PANTA_API_KEY;
  console.error(`SignalForge: ${key ? message.split(key).join('[REDACTED]') : message}`); process.exitCode = 1;
});
