# Submission dossier — one product, two sidetracks

**Current state: working prototype with public source and a live static demo; not registered or submitted to the contests. No prize has been awarded.**

The audited listings were open with a shared deadline of **October 13, 2026 at 06:59 UTC** (October 12 at 11:59 PM Pacific). Panta advertises a 5,000 USDG pool (2,000 first place; three 1,000 awards). Meteora advertises a 20,000 USDC pool (10,000 / 5,000 / 3,000 / 1,500 / 500). These are judged awards, not agreed compensation. Confirm current rules and eligibility at the listings before submission.

## Common project fields

**Project name:** SignalForge

**One sentence:** SignalForge turns prediction-market evidence and explicit event-linked budgets into reproducible Meteora bonding-curve stress tests.

**Description:** Launch teams can inspect a curve yet still struggle to explain what their budget assumptions mean at execution time. SignalForge separates evidence from assumptions: it collects Panta catalog, detail and trade data, grades freshness and market quality, then rehearses two operator-defined budgets across three official Meteora DBC curve configurations. It exposes fees, migration-limited fills, unused input, and review gates. Every report exports the original inputs, quote sweeps, configurations and fingerprints, so another developer can replay the entire calculation. The current demo contains clearly labeled synthetic Panta evidence and real SDK math. Live API verification and external user testing are still pending.

**Public repository:** https://github.com/AIVensk/signalforge

**Working demo:** https://aivensk.github.io/signalforge/

**Pitch presentation:** https://aivensk.github.io/signalforge/pitch.html

**PDF:** https://aivensk.github.io/signalforge/presentation/signalforge-pitch.pdf

**Entrant project profile:** human registration and official submissions pending.

**AI assistance:** Implementation and documentation were developed with AI assistance; the entrant must personally review the work and follow the applicable contest rules.

## Panta-specific explanation

Panta supplies the event evidence layer through its authenticated catalog, live detail and recent-trade endpoints. SignalForge does not treat catalog null prices as zero, reject a whole run when one detail read fails, or present incomplete pagination as complete coverage. Freshness, active phase, observed activity, volume and complement checks govern whether market-price weights may be used in scenario summaries. This brings Panta data into a launch-planning workflow beyond a standalone prediction-market destination.

The functional HTTP adapter is complete and covered by contract tests. It has not been exercised against an authorized live account. The synthetic demonstration must stay labeled until replaced with a real captured snapshot. Live use requires a relevant actual market; if no relevant market exists, keep the scenario hypothetical instead of fabricating relevance.

[Panta listing and requirements](https://superteam.fun/earn/listing/panta-api-side-track/)

## Meteora-specific explanation

Meteora is the calculation engine. SignalForge builds three structurally validated DBC configurations, sweeps fourteen independent input amounts through the SDK's partial-fill quote path, and compares exact fees and migration behavior for two conditional budgets. The supplied 40,000 USDC scenario reaches migration in the front-weighted profile while the other profiles remain below their thresholds. That comparison helps developers understand the consequences of curve shape and is reproducible down to base units.

This fits the listing's developer-tooling category. Its present weakness is traction: there is no mainnet deployment or user adoption, which the sponsor says it prefers. No post-migration DAMM execution is claimed. The project should be presented as a rigorously tested prototype, not a complete launchpad.

[Meteora listing and requirements](https://superteam.fun/earn/listing/meteora-dbc/)

## Three-minute demonstration script

1. **0:00–0:25 — Problem.** Explain that the report separates event evidence, budget assumptions and curve execution. Point out the synthetic-data banner immediately.
2. **0:25–0:55 — Evidence.** Show the usable anchor, stale/thin diagnostic market, and missing prices. Explain that null is not zero and price weights are not calibrated probabilities.
3. **0:55–1:40 — SDK comparison.** Toggle token output and terminal price. Show the front-weighted YES scenario: 38,870.109491 USDC consumed, 1,129.890509 unspent, migration reached. Contrast the other curves as configuration outcomes, not recommendations.
4. **1:40–2:15 — Reproducibility.** Open JSON and CSV, run the `verify` command, and show a deliberate altered report failing verification.
5. **2:15–2:45 — Integration.** Explain authenticated GET-only capture, bounded pagination, failure handling, and the pinned official SDK. State clearly that live API proof is pending.
6. **2:45–3:00 — Next evidence.** Describe an authorized live capture and a launch-team usability test. Do not claim either has already happened.

## Remaining entrant actions

- Personally confirm eligibility, account requirements and official rules, and register/submit as a human entrant. The audited platform records designate these listings `HUMAN_ONLY`.
- Use one original Colosseum project for both eligible sidetracks; sidetrack submission does not replace official Colosseum submission.
- Supply an authorized Panta key locally, run capture, select a relevant actual anchor, and verify a fresh report. No secret should appear in the repository or presentation.
- Review the published repository, demo and six-slide pitch, and record or deliver the presentation if required. Public hosting does not register an entrant or submit a contest entry.
- Complete the requested links honestly. Meteora's form currently says “Frontier Hackathon” while its description references Crypto World's Fair; clarify that inconsistency with the sponsor rather than falsely answering an incompatible registration question.
- Submit the same product to the official Colosseum flow and the two sidetracks after reviewing their current requirements.

[Official Colosseum rules](https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf)
