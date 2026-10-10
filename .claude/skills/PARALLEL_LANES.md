# PARALLEL_LANES — multi-session execution protocol

**When to use:** running multiple concurrent Claude sessions on disjoint work lanes of a single migration or multi-lane sprint. Currently applies to the `/discover` migration. Extend as other multi-lane migrations appear.

**Relationship to other skills:**
- Not a replacement for `SPRINT_EXECUTOR_ROLLING_CHECKPOINT` — that skill executes a single sequential sprint. This skill coordinates *multiple* sessions that each may or may not be running a sprint.
- Not a replacement for `ROUTE_AND_RUN` — each session still triages and routes its own issues per `ROUTE_AND_RUN`. This skill layers ownership/queue rules on top.

---

## Canonical source of truth

1. **Lane plan + file ownership + queue order** — committed repo file, read-only:
   - `.claude/state/discover-parallel-plan.md`
2. **Live queue state** — GitHub tracking issue's pinned comment (updated by queue coordinator).
3. **Flyway slot claims** — `.claude/state/flyway-claims.md` (append-only, PR to claim).
4. **Per-PR fixlog** — existing `.claude/state/current-pr.md` convention.

---

## Session ownership protocol

### A. Claiming a lane
A session "owns" a lane by declaring it in its opening prompt and in every PR it opens:
- PR title prefix includes the lane ID: `feat(discover)[A-2]: …` or `feat(discover)[C-switch]: …`.
- PR description first line: `Lane: A` (or B/C/D/E).
- No two sessions open concurrent PRs under the same lane ID (one PR per lane per issue ID).

### A.1 Branch naming (uniqueness required)
Every branch name must be unique per session. Never reuse an existing branch name, even if the prior branch was merged or abandoned.

Format: `<type>/<lane>-<issue>-<short-description>-<YYYYMMDD-HHMM>`

Examples:
- `feat/a-lib-discover-utils-20260423-1530`
- `chore/flyway-claim-v62-b2-20260423-1612`
- `feat/c-switch-lazy-markers-20260424-0930`

Before `git checkout -b <name>`, run `git branch --list <name>` and `git ls-remote --heads origin <name>` — if either returns a match, pick a new timestamp.

### A.2 Branch isolation (blocking)
- **No session may edit any file while on `main`.**
- **A feature branch must exist BEFORE any file is opened, read-for-edit, or modified.**
- No exceptions. Reading for exploration is fine; any edit — including throwaway, experimental, or "just one line" — requires a feature branch first.

**First action of every terminal prompt (run before anything else):**
```
git branch --show-current
```

Dispatch on the output:
- **If `main`:** STOP. Do not open, edit, or stage any file. Create the branch first:
  1. `git pull origin main`
  2. `git checkout -b <unique-branch-name>` (per §A.1 format)
  3. Re-run `git branch --show-current` to confirm the output is the new branch name.
  Only then proceed with the task.
- **If a feature branch:** verify it is the branch you intend to work on for this task; proceed.

PRs must originate from feature branches only. A PR opened from `main` is invalid — the coordinator rejects it on sight (see §C.3).

**Pre-commit hook is a safety net, not the primary rule.** The repo ships `.githooks/pre-commit` which blocks commits on `main`, and every session must run `git config core.hooksPath .githooks` at bootstrap. But the hook only catches the moment of commit — by then a session has already edited on `main`, which is itself a violation. The primary rule is: **never edit on `main`.**

### B. Shared-file protection
Each session reads `.claude/state/discover-parallel-plan.md` at start-up. Before editing any file, it checks the file-ownership table. If the file is marked **forbidden** for its lane's current phase, the session stops and reports back — it does **not** edit the file.

Forbidden files for all introduce-phase sessions: `Index.tsx`, `PropertyMap.tsx`, `usePropertyListings.ts`.

### C. Switch queue token
Only the **queue coordinator session** grants the switch token. Protocol:
1. Lane session finishes all introduce PRs for its switch → announces readiness by commenting on the tracking issue.
2. Coordinator checks queue order, verifies prerequisites, and for any frontend switch that depends on backend work, performs the **backend-deploy verification** (§C.1) before granting the token.
3. Coordinator updates the pinned comment transferring the token.
4. Lane session sees the token transferred, opens its switch PR, merges, announces completion on the issue.
5. Coordinator updates pinned comment releasing the token and promotes the next lane.

Token is a named string: `token=A-5`, `token=C-switch`, etc. Stored in the tracking-issue pinned comment.

### C.1 Backend-deploy verification (blocking)
Before granting a frontend switch token that depends on backend work, the coordinator must:
1. `curl` the real target endpoint in the environment the frontend switch will exercise (local stack or staging — not a unit-test fixture).
2. Verify HTTP `200` response.
3. Verify the response body contains the expected top-level fields (e.g. `areas`, `markers`, `count`, `centroid`, `bbox`) and that values are **non-stubbed** — no empty arrays masquerading as populated responses, no placeholder strings, no `null` in required fields.
4. Paste a redacted response snippet (first 500 bytes is enough) into the GitHub coordination comment as proof.
5. If the response is empty, stubbed, returns non-200, or is missing any required field, **do not grant the token**. Post `verification failed` on the tracking issue with the snippet and wait for the lane to fix the deploy.

### C.2 API contract stability
Once an endpoint is consumed by another lane (i.e. a frontend hook or E2E spec uses it), the producing lane is locked into backward-compatible evolution.

**Allowed without coordination:**
- Adding new optional response fields.
- Adding new optional request parameters.
- Widening accepted request values (if no consumer depends on rejection).

**Not allowed without coordination:**
- Renaming a field.
- Removing a field.
- Changing a field's type or nullability.
- Narrowing accepted request values.
- Changing HTTP status semantics for an existing case.

**Breaking changes require:**
- A coordination comment on #795 proposing the change.
- Consumer-lane acknowledgement.
- A **single PR** that updates the producer and every consumer together — not two sequential PRs.
- Coordinator sign-off before the combined PR merges.

### C.3 Coordinator branch check (blocking)
Before granting **any** token, the coordinator must verify:

```
rtk gh pr view <PR#> --json headRefName,headRepositoryOwner --jq '.headRefName'
```

The `headRefName` must not be `main`. If it is `main`, the coordinator rejects the token request with `verification failed: PR branch is main — create a feature branch per §A.2` and does not grant.

This check is in addition to §C.1 backend-deploy verification — both must pass.

### D. Flyway slot claim
Before opening a migration PR:
1. Open a tiny PR editing `.claude/state/flyway-claims.md` appending a row.
2. Wait for merge.
3. Only then open the migration PR referencing the slot.

### E. Controller/file ownership
See `.claude/state/discover-parallel-plan.md` §File ownership. Controllers are partitioned one-per-lane; no "shared scaffold" PR.

### F. Heartbeat + resume protocol

**Heartbeat (coordinator-driven):**
- If a lane has had no commit on its branch and no comment on #795 for **12 hours**, the coordinator pings the lane on #795: `heartbeat check: Lane X — any progress?`.
- If there is no response within another **12 hours** (24h total silence), the coordinator posts `Lane X released for takeover at <timestamp>` and transitions the lane to unowned.

**Resume (takeover session):**
A session is considered dead after the coordinator posts the release message. To take over:
1. New session reads `.claude/state/discover-parallel-plan.md` and the tracking issue (including the coordinator's release timestamp).
2. Fetches the dead session's branch locally.
3. Posts a `resuming Lane X from commit <SHA>` comment on the tracking issue.
4. Continues from the branch, preserving commit history. Does not squash or reset the prior session's commits.
5. Coordinator updates the lane ownership in the tracking issue body.

### G. PR opening checklist (every session)
Before `gh pr create`:
- [ ] Lane ID in title and description.
- [ ] Files touched match `.claude/state/discover-parallel-plan.md` ownership table.
- [ ] Issue ID (e.g. A-2) referenced.
- [ ] If this is a **switch PR**, queue token is held (per tracking issue pinned comment).
- [ ] If this is a **migration PR**, Flyway slot claim PR has merged.
- [ ] If this is a **frontend switch PR**, backend endpoint deployed + `curl` verified.
- [ ] Local E2E gate green: `npm run test:e2e:gate` (canonical suite on the local auth stack; clean tree so `.e2e-passed` is written).

### H. Merge sequencing
Introduce PRs: merge first-come-first-green.
Switch PRs: strictly ordered per `.claude/state/discover-parallel-plan.md` queue. Coordinator advances token only after previous switch PR is merged *and* backend state (if any) is deployed.

---

## Forbidden actions

- A lane session must not touch another lane's files even to "fix a quick thing."
- A lane session must not open two concurrent PRs under the same lane ID.
- No session may edit `.claude/state/discover-parallel-plan.md` without explicit coordinator sign-off — it is the canonical plan, not a working doc.
- No session opens a switch PR without holding the token.
- No session opens a migration PR without merged Flyway claim.

---

## When the migration finishes

1. Coordinator posts "migration complete" on the tracking issue.
2. `.claude/state/discover-parallel-plan.md` gets a `Status: complete` front-matter update in a final housekeeping PR.
3. `.claude/state/flyway-claims.md` stays (historical record).
4. Tracking issue is closed with a summary of merged PRs per lane.
