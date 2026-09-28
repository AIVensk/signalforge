import { readFileSync } from 'node:fs';
import { launchSchema, snapshotSchema } from '../src/schema.js';
export const fixture = () => snapshotSchema.parse(JSON.parse(readFileSync('fixtures/panta-synthetic.json', 'utf8')));
export const launch = () => launchSchema.parse(JSON.parse(readFileSync('examples/energy-launch.json', 'utf8')));
export const NOW = new Date('2026-09-28T16:00:00Z');
export const MARKET_ID = '11111111111111111111111111111111';
export const KEY = 'pk_test_synthetic_unit_tests_12345678';
export function response(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json', ...headers}});
}
