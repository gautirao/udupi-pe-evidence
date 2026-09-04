# Issue #2427 — `e2e-identity-seed.sh` contract verification

The full E2E run exercises the library's **best-effort success** path only (all
three identities seeded). Two things it does not reach:

- the **`required`** mode, used solely by `scripts/dev/local-fixture-backend.sh`
- either mode's **failure** paths

`local-fixture-backend.sh` cannot be executed to cover this. It restores the
machine-wide `pg-test-fixture` singleton, which a concurrent lane is holding
right now (`docker ps` shows it running alongside `pg-dev-issue-2420`), and
running it would recreate that container underneath another agent's work. So the
refactored `required` path is verified directly against the library instead.

## Command

```
bash scratchpad/verify-seed-lib.sh
```

The harness runs under `set -euo pipefail`, the same mode both callers use — the
point being that a best-effort failure must not abort the caller.

Exit code: **0** (all checks executed)

## Output

```
ERROR: admin credentials are required but absent.
RESULT required + absent creds -> rc=1 (expect 1)
>>> Skipping broker identity seed — no credentials configured.
RESULT best-effort + absent creds -> rc=0 (expect 0)
RESULT last-uuid=[] last-token=[] (expect both empty)
>>> Logging in to Supabase Auth as broker (best-effort)...
curl: (7) Failed to connect to 127.0.0.1 port 1 after 0 ms: Couldn't connect to server
>>> WARNING: broker login request failed (network/transport error) — broker identity not seeded.
RESULT best-effort + unreachable auth host -> rc=0 (expect 0, script still alive)
>>> Logging in to Supabase Auth as admin (required)...
curl: (7) Failed to connect to 127.0.0.1 port 1 after 0 ms: Couldn't connect to server
>>> WARNING: admin login request failed (network/transport error) — admin identity not seeded.
RESULT required + unreachable auth host -> rc=1 (expect 1)
RESULT double-source guard survived, script still running
ALL CHECKS EXECUTED
```

## What this establishes

| Check | Expected | Actual |
| --- | --- | --- |
| `required` + absent credentials | rc 1 | rc 1 |
| `best-effort` + absent credentials | rc 0 | rc 0 |
| Output globals cleared on a skip | both empty | both empty |
| `best-effort` + unreachable auth host | rc 0, caller survives errexit | rc 0, caller survives |
| `required` + unreachable auth host | rc 1 | rc 1 |
| Re-sourcing the library | no redefinition error, caller survives | survives |

So `local-fixture-backend.sh` still exits when it cannot seed the admin identity,
exactly as it did before this refactor, and neither caller can be aborted by a
best-effort credential that is absent or unusable.

## Coverage gap, stated honestly

The `required` **success** path is not directly executed here, since that needs a
real login plus a live fixture. It is however the same code path the E2E run
takes for all three best-effort identities, all of which succeeded and wrote
their `user_roles` rows — proven downstream by `global-setup` completing the
admin-role-gated approve call. The only untested line is the `return 1` selection
for a required failure, which the two `rc=1` rows above cover.
