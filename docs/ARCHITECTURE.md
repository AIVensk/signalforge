# Architecture and limits

```text
Panta catalog → authenticated detail and recent trade reads → validated snapshot
                                                           ↓
Operator-defined anchor + YES/NO budgets → evidence checks → weighted scenarios
                                                           ↓
Official Meteora SDK curve builders → partial-fill quote sweeps → review packet
```

## Source modules

| Module | Responsibility |
| --- | --- |
| `schema.ts` | Validates API responses, snapshots, amount syntax, and launch inputs. Rejects duplicate markets and mixed-market trade tapes. |
| `panta.ts` | Fixed-origin API client; bounded pagination; deduplication; identity checks; bounded retries; explicit partial coverage. |
| `evidence.ts` | Freshness, market phase/timing, volume, recent-trade, missing-price and complement checks. |
| `dbc.ts` | SDK curve generation, structural validation, exact base-unit conversion, independent quote sweeps, partial fills. |
| `planner.ts` | Evidence-to-scenario composition, review gates, deterministic fingerprints. |
| `render.ts` | Standalone, escaped HTML report and numeric quote CSV. |
| `cli.ts` | Capture, analyze, demo, verify, compare, and atomic artifact exports. |

## Panta integration contract

The client follows the official September 2026 documentation for `GET /markets/`, `GET /markets/{marketId}/`, and `GET /markets/{marketId}/trades/`. It supplies `X-Api-Key` only to `https://live-api.panta.market/api/v1`. Redirects are refused. API bodies are bounded to 2 MB and validated before use. The documented terminal catalog page may return null or omit `nextCursor`; both are handled.

Catalog prices are not substituted for live detail. Failed detail or tape reads are recorded, and evidence checks withhold the affected market. Lists are paginated across the primary and secondary phases with explicit page and detail limits. Ordinary collection reads are spaced by 550 ms; HTTP 429/5xx responses receive up to two retries by default. `Retry-After` values above 30 seconds stop the call instead of silently ignoring server limits. Run capture again later when appropriate. Network failures stop the request; they are not endlessly retried.

The built client is contract-tested using injected HTTP responses. **No successful live Panta capture is claimed.** API credentials are absent from the delivered package. “Powered by Panta” appears in the CLI and generated report. No private keys, wallets, signing, market creation, transactions, or on-chain writes are part of the product.

## Evidence interpretation

YES and NO spot prices are normalized only if they are present, individually at most 1, have a positive sum, and satisfy the configured complement tolerance. A usable anchor additionally needs a recent snapshot, an active market, sufficient reported volume, and sufficient recent unique trade IDs. Future timestamps, unavailable reads, inactive phases, and missing anchors block weighted results.

The normalized weight is `YES / (YES + NO)`. It is a descriptive market-price weight. The operator supplies the two budgets and the reason the event is relevant. Other markets remain diagnostics; the model makes no independence assumption and does not turn prediction-market volume into expected token demand. Unique wallets are not unique people, and volume is not proof of organic activity.

## Meteora integration

Pinned engine: `@meteora-ag/dynamic-bonding-curve-sdk@1.5.13`.

- The constant-liquidity profile uses `buildCurveWithMarketCap`.
- Front-weighted and back-weighted profiles use `buildCurveWithLiquidityWeights` with inverse sixteen-element integer weight schedules.
- `validateConfigParameters` checks each generated configuration. A nonzero local placeholder satisfies the leftover receiver requirement; it is never exported as a chosen real recipient.
- `getCurveBreakdown` supplies segment allocations and the migration boundary.
- `DynamicBondingCurveClient.pool.getQuoteFromInputAmount` with `SwapMode.PartialFill` supplies fee-aware empty-pool quotes. Its connection is injected with a fetch function that always throws, preventing accidental RPC reads.

Each probe starts from the same empty pool; probes are not sequential buys. All amounts are six-decimal base tokens and six-decimal USDC-denominated quote units. Exact integer units use BN; Decimal handles human-readable calculations. Dynamic fees are disabled and fixed quote-side fees are used. No token-transfer fees are modeled. The diagnostic configuration uses immutable token authority, 100% permanently locked partner LP, no vesting, and a one-millionth supply rounding reserve.

`requested = used + unspent` and `used = curve inflow + total fee`. Migration can limit consumption. Gross execution premium compares average consumed-input cost per token with the initial marginal price, including fees; it is not slippage tolerance or profit. Exported SDK configurations contain BN values as decimal strings and are for review. Rebuild them from launch inputs before any separately reviewed transaction workflow.

## Boundaries

This prototype stops at DBC migration. It does not simulate DAMM v2 post-migration execution, deploy pools, check a live token mint, or measure mainnet traction. Constant fees, empty-pool initial state, chosen supply/caps, scenario budgets, and synthetic data are disclosed. JSON provenance is editable and not cryptographically authenticated. Tests establish implementation behavior, not future market outcomes.

## Primary references

- [Panta API authentication](https://docs.panta.market/guides/authentication)
- [Panta catalog](https://docs.panta.market/api-reference/markets/list)
- [Panta market detail](https://docs.panta.market/api-reference/markets/get)
- [Panta recent trades](https://docs.panta.market/api-reference/markets/trades)
- [Panta errors and limits](https://docs.panta.market/guides/errors)
- [Panta attribution and access terms](https://docs.panta.market/guides/terms-of-use)
- [Meteora DBC developer guide](https://docs.meteora.ag/developer-guides/dbc)
- [Official Meteora TypeScript SDK](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk)
