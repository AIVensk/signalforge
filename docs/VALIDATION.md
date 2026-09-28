# Validation evidence

Verified September 28, 2026 with Node 26.10.0, npm 12.1.0, TypeScript 5.9.2, and official Meteora DBC SDK 1.5.13.

`npm test` passes 23 tests. They cover:

- CLI packet generation, complete replay, and detection of altered quote output.
- Capture failing before any request or output when credentials are absent.
- Exact decimal/base-unit conversion and rejection of precision/range errors.
- Conservation of gross input, fees and unused budget across three curves; monotonic quote outputs; migration boundaries.
- An independent integer constant-liquidity equation agreeing with the first-segment SDK quote.
- Six cap/fee configurations through official SDK generation and validation.
- Missing, stale, future, resolved, thin and duplicated evidence; rejection of mixed-market tape and duplicate market records.
- Deterministic report fingerprints independent of key order; altered inputs changing run identity.
- HTML escaping, explicit fixture labeling, no external report scripts, and numeric CSV fields.
- Fixed-origin authenticated reads, no credentials in URLs, redirect refusal, bounded response bodies, and schema rejection.
- Rate-limit retries, date/seconds Retry-After handling, refusal of excessive waits, cursor cycles, page/detail caps, null detail prices, and market identity mismatches.
- The documented omitted terminal cursor and honest fixture/live provenance language.

Browser verification inspected the rendered HTML and confirmed token-output/terminal-price chart switching, expanded scenario summaries, readable table values, and no horizontal overflow at the default desktop viewport. It found and fixed an SVG visibility issue that static checks had not caught. Browser interactions were performed through the supported desktop browser automation tool. Mobile viewport behavior was not independently exercised.

`npm run demo` produces run `f691e804aa6930e0`. A full `verify` replay matches the saved report. The demo intentionally returns `review-required` with synthetic evidence and human-review gates, not a green production-ready status.

The SDK's optional native bigint binding was unavailable; its JavaScript fallback ran successfully. No live Panta call, RPC call, wallet transaction, pool deployment, external submission, or user traction is included in this verification claim.
