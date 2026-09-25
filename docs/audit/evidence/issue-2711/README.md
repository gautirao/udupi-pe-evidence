# Issue #2711 — real-browser evidence

Map Filters sheet Apply committing Buy/Rent intent atomically with canonical filters, at
390×844. Captured with `capture-2711.mjs` (adapted from `docs/audit/evidence/issue-2708/capture-2708.mjs`
— same technique: `/api/**` mocked to an empty superset so no live backend/fixture stack is
needed, plus a live-URL overlay baked into the page so the canonical URL state is visible in
every screenshot, not just asserted in prose).

Run: `node capture-2711.mjs <before|after> <baseUrl> <outDir>` against a plain
`npm run dev -- --port <port>` frontend (no backend required).

- **before** — captured at `c7e65529` (this branch's base, immediately pre-#2711).
- **after** — captured at `d71d5254` (this branch's HEAD after all 6 fix/test commits).

## Scenario 1 — Map sheet Rent + a budget band → Apply (`0{1,2,3}-rentbudget-*`)

Stage Rent + the "≤ ₹15,000/month" budget band, then Apply.

| | before (`c7e65529`) | after (`d71d5254`) |
|---|---|---|
| Final URL | `?city=bangalore&type=apartment&priceMax=15000` | `?city=bangalore&type=apartment&intent=rent&priceMax=15000` |
| `intent` param | **missing** — the bug this issue fixes | `rent` |

## Scenario 2 — Rent + an unrelated staged field (bedrooms) → Apply (`0{4,5}-rentbeds-*`)

The code-review-caught follow-up regression: stage a 2 BHK filter (a field the intent
transition does not own) AND switch to Rent in the SAME sheet visit, then Apply.

| | before (`c7e65529`) | after (`d71d5254`) |
|---|---|---|
| Final URL | `?city=bangalore&type=apartment&beds=2` | `?city=bangalore&type=apartment&intent=rent&beds=2` |
| `intent` param | **missing** | `rent` |
| `beds` param | `2` | `2` (survives alongside the intent commit) |

`before.json` / `after.json` are the script's own machine-readable output (the exact URL at
each step, canonicalised to the filter/intent-relevant params). Screenshots carry a
`[capture overlay: live URL]` strip at the bottom showing the actual `location.search` at
capture time — the same value the JSON records, so the two corroborate each other.

Real, matching E2E coverage for both scenarios (against the real seeded backend, not the
mocked API this capture script uses) lives in
`e2e/discover/issue-2711-map-filter-intent-commit.spec.ts` (AC1 and AC5) — 6/6 passing at
`d71d5254`.
