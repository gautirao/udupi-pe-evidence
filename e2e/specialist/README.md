# Specialist Playwright suite (opt-in, local-only, NOT the E2E gate)

Issue #2750, slice S0. This directory holds browser-only specs that were deliberately kept
(`RETAIN_SPECIALIST` in [`docs/testing/e2e-retirement-manifest.csv`](../../docs/testing/e2e-retirement-manifest.csv)).

**This suite is NOT the E2E gate and its results are NEVER E2E evidence.** The one authoritative merge
gate is `npm run test:e2e:gate` (canonical suite, see [`e2e/README.md`](../README.md)). The specialist
suite is never run by CI, never run by the pre-push hook, never writes `.e2e-passed`, and never prints
`CANONICAL E2E GATE: PASS`.

## What qualifies

A spec belongs here only for one of these reason codes, naming the specific row that only a real browser can prove:

| Code | Meaning |
|---|---|
| `HIT_TEST` | real stacking / actionability (`elementFromPoint`, a click that must land) |
| `PAINT_GEOMETRY` | painted pixels, paint order, computed paint (a jsdom run cannot produce them) |
| `LAYOUT_OVERFLOW` | real layout metrics (pseudo-element hit areas, wrapping, overflow) |
| `LEAFLET_REAL` | the real Leaflet / markercluster behaviour |
| `RADIX_REAL` | the real Radix primitive (the jsdom stand-in stalls on it) |
| `POINTER_REAL` | real touch / pointer input |

"Hard to replace" or "the lower-level test was never written" does NOT qualify (issue #2750 wording).
The manifest rationale starts with one or more `[CODE]` tokens, followed by the specific browser-only row.

## Admission checklist

A spec is admitted only when all of these hold:

1. `git mv` it to `e2e/specialist/<stem>.specialist.ts` (flat; a file from `e2e/discover/` gets a `discover-` prefix).
2. Its manifest row is `RETAIN_SPECIALIST` (decision and status) with a `[CODE]` and the browser-only row it protects.
3. `import { test, expect } from './support/specialist-test'` (never `test` from `@playwright/test`; type imports are fine).
4. No host literals, no env-default hosts, no `test.skip` / `fixme` / `only`, no `e2e/fixtures/*-auth.json`,
   no route `continue()` (use `fallback()` / `fulfill()`), no `page.request` / `request.newContext` / `fetch`
   (use `backendGet()` / `backendBaseUrl()`).
5. Any console-only probe is an `expect`.
   - 5b. No silent fixture-conditional assertion: a precondition is an `expect`, never an `if ()`.
6. Green in `npm run test:e2e:specialist` run from inside the worktree, `--workers=1`, twice in a row, with 0 skipped,
   0 flaky and 0 blocked external requests.
7. `npm run test:e2e:guard` passes (estate rules SP1-SP9 plus the config and drift checks).

## External hosts

The only non-loopback hosts a specialist run may reach are the app's hard-coded static assets, each cited in
`scripts/e2e/specialist-suite.mjs` (`ALLOWED_EXTERNAL`):

- `*.tile.openstreetmap.org` - Leaflet tiles, `apps/web/src/components/map/PropertyMap.tsx:3082-3084`
- `fonts.googleapis.com` and `fonts.gstatic.com` - Google Fonts, `apps/web/index.html:46-49`

The table can grow only by a static-asset host the app hard-codes (cited with file:line). It can never grow by a
production, shared or Supabase host; the deny-list (`propertysignal.in`, `*.pages.dev`, `*.onrender.com`,
`*.supabase.co`) always wins. Any other external request is aborted by the runtime guard and fails the test.

Reserved RFC test TLDs (`.test`/`.invalid`/`.example`) are NOT ignored; they are handled per layer:

- SP4 (static) still ALLOWS a reserved-TLD literal in a spec, because fulfil-mocks use them (`route.fulfill` for `https://mock.test/...`).
- Layer 1 (route handlers) only sees a request that no earlier page route fulfilled. A reserved-TLD request reaching it was not mocked, so it is aborted and recorded as `reserved-test-TLD (not fulfilled by a mock)`, and the test fails.
- Layer 2 (`context.on('request')`) also fires for mock-fulfilled requests and cannot tell them apart, so it deliberately does NOT flag reserved TLDs.
- WebSockets have no fulfil-mock, so a reserved-TLD socket is always recorded as blocked and the test fails.

SP9 is textual and comment-stripped: bare `fetch(`, `fetch?.(`, `globalThis|window|self.fetch(` and the bracket form `globalThis['fetch'](` are all banned, including inside `page.evaluate`. Use `backendGet()`.
`APIRequestContext` traffic is invisible to the browser guard, which is why specs must use `backendGet()`.
Specs may not open their own browser or context (no `browser` fixture, `newContext`, `launch`, `connectOverCDP`; SP9), because that would bypass the runtime guard.

## How to run

```bash
E2E_GATE_FRONTEND_PORT=5380 E2E_GATE_BACKEND_PORT=8380 npm run test:e2e:specialist
```

Run it from INSIDE the worktree. It builds the same per-worktree local stack as the gate (disposable `pg-gate-*`
Postgres container, pinned local auth stack, loopback only). It prints a `SPECIALIST suite: NOT the E2E gate`
banner first and ends with `SPECIALIST SUITE: PASS @ <sha> (NOT the E2E gate; .e2e-passed untouched)` or a FAIL. It is refused when `CI` or
`GITHUB_ACTIONS` is set, and when `E2E_AUTH_MODE` is not `local`. Never run it against production, the shared DEV
Supabase, hosted Supabase Auth or the `pg-test-fixture` container.

## Red policy

A red specialist test is never "same as main" and never parked. The PR or run that observes it opens an issue. If it is
still red after 14 days, the owner decides between repair and deletion (deletion needs by-name owner approval).
There is no `skip` / `fixme`; estate rule SP5 enforces that.

## Reversibility

To un-admit a spec: `git mv` it back to its previous path and restore its manifest row from `d81895f5`
(the base commit of slice S0).
