import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('CLI exports a complete packet, replay verifies, and tampering fails verification', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  try {
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const call = (...args: string[]) => spawnSync(process.execPath, ['dist/cli.js', ...args], {encoding: 'utf8', env});
    const demo = call('demo', '--out', dir); assert.equal(demo.status, 0, demo.stderr);
    for (const name of ['report.html', 'report.json', 'snapshot.json', 'launch.json', 'quotes.csv', 'config-front-weighted.json'])
      assert.ok(readFileSync(join(dir, name)).length > 20);
    const args = ['verify', '--report', join(dir, 'report.json'), '--launch', join(dir, 'launch.json'), '--snapshot', join(dir, 'snapshot.json')];
    const verified = call(...args); assert.equal(verified.status, 0, verified.stderr);
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')); report.curves[0].outcomes.yes.tokenOutput = '999';
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report));
    const tampered = call(...args); assert.equal(tampered.status, 1);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
test('capture without a key fails without making a request', () => {
  const env = {...process.env}; delete env.PANTA_API_KEY; delete env.NODE_TEST_CONTEXT;
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-no-key-'));
  try {
    const out = join(dir, 'uncreated');
    const result = spawnSync(process.execPath, ['dist/cli.js', 'capture', '--out', out], {encoding: 'utf8', env});
    assert.equal(result.status, 1); assert.equal(existsSync(out), false);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
