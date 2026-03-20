# E2E Gate Design — Marker-Based Deduplication

## Problem

The pre-push hook and the ROUTE_AND_RUN QA E2E gate both run the full Playwright
suite (`npm run test:e2e:local`). For workflow-driven pushes, this means E2E runs
twice per PR — once in the QA gate, once on push. The redundancy causes:

- **Wasted time**: ~40s per extra run, 3-5 extra runs per sprint
- **Flaky failures from rate limiting**: Supabase auth rate-limits login attempts;
  running E2E 3x in quick succession triggers auth timeouts on unrelated tests
- **False negatives on push**: Tests fail not because of code problems but because
  the auth provider is throttling

Sprint 21 data: RE-128 required 3 push attempts due to auth rate limiting from
running E2E too many times in succession. All failures were in login helpers,
completely unrelated to the backend-only changes.

## Solution: `.e2e-passed` Marker File

A simple two-line marker file that records when E2E last passed for a given commit.

### Format

```
<commit SHA>
<ISO-8601 UTC timestamp>
```

Example:
```
3e7b25b4a1f2c8d9e0b1a2c3d4e5f6a7b8c9d0e1
2026-03-20T07:06:00Z
```

### Who writes it

| Writer | When |
|--------|------|
| ROUTE_AND_RUN orchestrator | After QA E2E gate passes (Step 3) |
| Pre-push hook | After E2E runs and passes (for manual pushes) |
| Orchestrator (manual) | After `npm run test:e2e:local` passes outside the workflow |

### Who reads it

The `.githooks/pre-push` hook reads it before deciding whether to run E2E:

```
pre-push hook fires
  │
  ├─ Doc-only changes? → skip
  │
  ├─ .e2e-passed exists AND SHA matches HEAD?
  │     → skip (already verified)
  │
  └─ No marker or stale marker
        → run full E2E suite
        → write marker on success
```

### Properties

- **Gitignored**: The marker is in `.gitignore` — never committed
- **Ephemeral**: Only exists in the local working tree
- **Stale-safe**: Checked by SHA, not by time — a new commit invalidates it
- **No false positives**: If the marker matches HEAD, the exact same code was verified

## E2E Applicability Rules

Not all PRs need E2E. The QA gate in ROUTE_AND_RUN uses these rules:

| PR type | E2E required? | Skip reason |
|---------|--------------|-------------|
| Frontend — new page/route | YES | — |
| Frontend — existing page change | YES | — |
| Backend — API consumed by existing FE page | YES | — |
| Backend — no FE consumer (new endpoint, no UI wired) | NO | `SKIPPED(no FE consumer)` |
| Doc-only / Trivial | NO | `SKIPPED(doc-only)` or `SKIPPED(trivial)` |

When the QA gate is skipped via applicability rules, no marker is written. The
pre-push hook will run E2E on push (since no marker exists). This is correct:
the hook serves as the only E2E safety net for skipped PRs.

## Interaction Matrix

| Scenario | QA gate | Marker | Pre-push hook |
|----------|---------|--------|---------------|
| Normal PR, FE consumer exists | Runs E2E | Written | Skips (marker) |
| Normal PR, no FE consumer | Skipped | Not written | Runs E2E |
| High-risk PR | Runs E2E | Written | Skips (marker) |
| Trivial PR | Skipped | Not written | Runs E2E (backstop) |
| Doc-only PR | Skipped | Not written | Skips (doc pattern) |
| Manual push (human) | N/A | Not written | Runs E2E |
| Push retry (same commit) | Already ran | Exists | Skips (marker) |

## How to write the marker (for orchestrator reference)

```bash
echo "$(git rev-parse HEAD)" > .e2e-passed
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> .e2e-passed
```

## How to invalidate the marker

Any new commit (`git commit`) changes HEAD, so the marker becomes stale
automatically. No manual invalidation needed.

To force E2E on next push: `rm .e2e-passed`
