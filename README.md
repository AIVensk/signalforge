# SignalForge

**A reproducible launch-rehearsal workbench for Panta market evidence and Meteora DBC curves.**

SignalForge connects a chosen prediction-market event to two explicit, operator-defined budget scenarios, then uses the official Meteora SDK to compare how those budgets fill across three bonding curves. It shows missing evidence, fees, migration boundaries, and unused input instead of hiding them inside a single score.

The bundled demonstration uses **invented Panta markets and trades with real Meteora SDK calculations**. It is a local, working prototype. Live Panta capture has not been executed because no authorized API key was available. Source/demo publication does not register or submit a contest entry. No mainnet deployment, trade, successful live capture, or prize is claimed.

[Browse the saved demonstration](docs/index.html) · [Submission dossier](docs/SUBMISSION.md) · [Rules and licensing notes](docs/RULES-REVIEW.md)

## Run the demonstration

Node 22.14 or later and npm are required. Verified here with Node 26.10.0 and npm 12.1.0.

```bash
npm ci
npm test
npm run demo
```

Open `artifacts/demo/report.html` directly in your browser. It needs no server or external scripts. The sibling JSON and CSV links work when you keep the whole folder together. The optional native bigint binding may emit a warning; the supported JavaScript fallback was used in verification.

The report includes:

- Three curves built and structurally validated by `@meteora-ag/dynamic-bonding-curve-sdk@1.5.13`.
- Fourteen independent input probes per curve, two conditional budget outcomes, fee breakdowns, and exact unused gross input.
- An anchor evidence assessment and two deliberately poor diagnostic markets, including a missing-price example.
- Switchable token-output and terminal-price charts, explanatory review gates, JSON, CSV, configuration exports, and input fingerprints.

For the supplied 40,000 USDC YES budget, the front-weighted curve reaches migration after consuming 38,870.109491 USDC and leaves 1,129.890509 USDC unused. The other two curves remain below migration. This is a simulation result, not a recommendation or claim about demand.

## Capture authorized live data

Obtain your own Panta API access and review the applicable access terms. Keep the key on the machine running this CLI, outside source control and public reports. The client only performs GET reads. A `pk_test_` key still targets the documented public production API origin; it does not mean a separate sandbox.

```bash
# Set PANTA_API_KEY securely in your environment; do not paste a real key into this file.
node dist/cli.js capture --category crypto --pages 3 --max-markets 30 --out artifacts/live
```

The snapshot records catalog coverage, collection time, live-detail availability, trade availability, and failures. Capture caps are per phase: up to 3 primary and 3 secondary catalog pages in this example, then details for at most 30 unique markets. Each market's trade sample is capped at 200. Select a relevant `marketId` from the snapshot and set it as `anchorMarketId` in a copy of `examples/energy-launch.json`. Define both budgets yourself; Panta prices do not infer demand for your token.

```bash
node dist/cli.js analyze --launch my-launch.json --snapshot artifacts/live/snapshot.json --out artifacts/live-analysis
```

Analysis uses the current time. Stale evidence blocks weighted conclusions. For an intentional, clearly historical replay, pass `--at 2026-09-28T16:00:00Z`. The demonstration alone automatically uses its fixed fixture timestamp.

## Replay and compare

```bash
node dist/cli.js verify --report artifacts/demo/report.json --launch artifacts/demo/launch.json --snapshot artifacts/demo/snapshot.json
node dist/cli.js compare --before artifacts/demo/report.json --after artifacts/live-analysis/report.json
```

Verification rebuilds the complete report using the saved timestamp and compares every field. Hashes prove reproducibility against supplied inputs; they do not authenticate an editable snapshot's origin.

## Integrate as a library

```ts
import { buildReport, renderHtml, launchSchema, snapshotSchema } from './dist/index.js';

const report = buildReport(launchSchema.parse(input), snapshotSchema.parse(snapshot), new Date());
const html = renderHtml(report);
```

See [architecture and limits](docs/ARCHITECTURE.md), [validation evidence](docs/VALIDATION.md), and [contest submission drafts](docs/SUBMISSION.md). These two prize tracks share one original product and one intended Colosseum project.

## Source publication and licensing

No project license has been selected or granted in this repository. Public source visibility is not an open-source license. Dependencies retain their respective licenses and are installed from the pinned lockfile; dependency source is not bundled. See [rules and licensing notes](docs/RULES-REVIEW.md).
