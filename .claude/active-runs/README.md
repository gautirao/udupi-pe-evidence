# `.claude/active-runs/` — Mode-3 run locks

One issue → one active run. This directory holds the **run locks** that enforce it.

## What lives here

- `issue-<N>.lock` — the active-run lock for issue `<N>`, written by the Main Agent in
  `/mode3-run` **Phase 0.0** the moment a run is authorised.
- `issue-<N>-attempt-2.lock` (`-attempt-3`, …) — the lock for an **explicitly
  user-authorised** second/third concurrent attempt (`second_attempt_approved = true`).

Lock files are **runtime state** and are git-ignored (see `.gitignore`). Only this
`README.md` and `.gitignore` are tracked, so the directory exists on a fresh checkout.

## Lifecycle

| Phase | Action |
|---|---|
| 0.0 (acquire) | After the duplicate-run scan is clean, write the lock from `.claude/templates/active-run-lock.toml`. |
| during run | Advance `current_phase`; fill `orchestrator_name` / `selected_ports` as they become known. |
| 10.5 (release) | Remove the lock **only** after: PR merged or issue abandoned **and** worktree cleaned-or-preserved **and** branch cleaned-or-preserved **and** final status reported. A blocked/declined run leaves the lock in place (fail-safe). |

## Why

Incident #1534: two sessions/worktrees ran the same issue concurrently and produced
conflicting PATH_B/PATH_C decisions, duplicated artefacts, and a tampered decision file.
The Phase-0.0 guard + this lock make a duplicate run a hard stop unless the user
explicitly authorises a second attempt.

## Contracts & checks

- Guard + lock contract: `.claude/mode3/contracts/main-agent.md` → *Duplicate-run guard & single-writer decision-file policy*
- Phase-0.0 dispatcher: `.claude/commands/mode3-run.md` → *0.0 — Duplicate-run preflight guard*
- Cleanup: `.claude/mode3/contracts/closeout.md` → *Phase 10.5 — Run-lock cleanup*
- Verifier: `python3 .claude/scripts/verify-mode3-duplicate-run-guard.py`
  (fails when two active worktrees/locks exist for the same issue without an approved second attempt)
