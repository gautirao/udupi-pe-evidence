# PR-7 amendment: the specialist suite must survive the legacy deletion (issue #2750, slice S0)

This is the amendment artefact. It amends `.claude/handoffs/issue-2750-pr1/approved-plan.toml`
`[pr_series]` PR-7 row (line 343) and `dead_code_removal` (line 118). The PR-1 plan file itself is not edited.

Slice S0 makes `RETAIN_SPECIALIST` a usable, local-only, opt-in terminal state (`e2e/specialist/`,
`playwright.specialist.config.ts`, `npm run test:e2e:specialist`). PR-7 deletes the legacy estate, so it must
not take the specialist suite with it.

## PR-7 must NOT delete

- `playwright.specialist.config.ts`
- `e2e/specialist/**` (specs, `support/`, `README.md`)
- `scripts/e2e/specialist-suite.mjs` and `scripts/e2e/specialist-suite.test.mjs`
- the `--suite=specialist` branch of `scripts/run-e2e-gate.sh` and the `test:e2e:specialist` package script
- `e2e/support/reachability.ts` (imported by the 2712 specialist spec): PR-7 either keeps it or RELOCATES it to
  `e2e/specialist/support/` and updates every importer in the same commit, with a `find_importers` proof
- any `e2e/helpers.ts` export imported from `e2e/specialist/**`: PR-7's planned move of `helpers.ts` to
  `e2e/canonical/support/` must update the specialist importers. Specialist code must not import from
  `e2e/canonical/**`, except `canonical-global-setup.ts` by path (the specialist config reuses it unchanged).

## PR-7 may still delete (unchanged)

The legacy `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `run-e2e-local.sh`,
`e2e-watch.sh`, the legacy fixture JSON files and the legacy package scripts. The specialist suite depends on none
of them: it has its own config, its own runner branch and its own guard rules. (If PR-7 deletes `playwright.config.ts`,
the `testIgnore: ['**/specialist/**']` safeguard in it goes with it, which is fine because nothing is left to collect
specialist files by accident.)

## Guard tightening

PR-7's C7 guard tightening ("only canonical + deployed + `RETAIN_SPECIALIST`") must list `e2e/specialist/**`
(estate rules SP1-SP9) explicitly as the `RETAIN_SPECIALIST` home, and keep the `e2e-parity` grandfathering
(the 2 existing parity rows).

## Importer proof

PR-7's `find_importers` + `git grep` deletion proof must include `e2e/specialist/**` as an importer root.

## End state

`end_state_status` stays "All rows are RETIRED or RETAIN_SPECIALIST". AC5 now reads: "every legacy spec except
`RETAIN_SPECIALIST` rows (under `e2e/specialist/` or `e2e-parity/`) and `e2e/deployed/**` is deleted".

## Amendment 3 (`pr7_amendment_3`, issue #2850): PR-7 is a final DISPOSITION, not a deletion

Amendment 3 supersedes the "PR-7 may still delete (unchanged)" section above and the AC5 sentence above. Reason: 140
legacy specs stay on disk (no deletion without a by-name owner approval); `playwright.config.ts` + `e2e/global-setup.ts`
are their only runner; SP2 forbids `RETAIN_SPECIALIST` status outside `e2e/specialist/` and `e2e-parity/`; specialist
admission needs per-spec edits and, for authenticated specs, new infrastructure; the #2822 closure claims do not hold at
assertion level; and the `helpers.ts` relocation collides with open PR-6 batches.

Original PR-7 row:

> PR-7 | e2e/helpers.ts + determinism.ts relocated to e2e/canonical/support/; docs final (generated counts); guard tightened
> to allow only canonical + deployed + RETAIN_SPECIALIST | playwright.config.ts (legacy), e2e/global-setup.ts,
> global-teardown.ts, e2e/support/reachability.ts, legacy fixtures json, run-e2e-local.sh, e2e-watch.sh,
> run-real-data-smoke.sh, legacy package scripts; e2e-parity per Q3 (default RETAIN_SPECIALIST) | none; #2751 closed (66
> titles retired by disposition) | gate PASS; AFTER inventory

Amended PR-7 row:

> PR-7 | manifest relabels per the analysis report + assertion-level verification; every SCHEDULED(PR-7) row -> RETIRED,
> RETAIN_SPECIALIST (e2e/specialist or e2e-parity only) or SCHEDULED(#issue) (decision RETAIN_SPECIALIST allowed with
> SCHEDULED(#issue), fail-closed); guard grammar SCHEDULED(#NNNN); loopback-only fence on playwright.config.ts (frontend AND
> backend) and global-setup (Supabase auth URL), production fallbacks removed; run-e2e-local.sh fails closed at the top
> (unconditional refusal before any env read or network-capable command; it has no non-hosted route) with a network-free
> sandboxed test + mutation proof; docs (generated counts, legacy runners labelled LEGACY, loopback-only, why kept);
> follow-up issues filed | NO spec files; no runner/config removed (playwright.config.ts, global-setup/teardown,
> run-e2e-local.sh, e2e-watch.sh, legacy package scripts KEPT: sole runner of SCHEDULED specs); helpers.ts/determinism.ts
> relocation DEFERRED; e2e-parity stays RETAIN_SPECIALIST | none; #2751 NOT closed | guard + guard:unit PASS; specialist
> isolation PASS; gen-e2e-inventory --check 0; canonical gate PASS

Restated end state: after PR-7 there are zero rows with status `SCHEDULED(PR-7)`. Every row that was `SCHEDULED(PR-7)` is
`RETIRED`, `RETAIN_SPECIALIST` or `SCHEDULED(#issue)` naming an OPEN real issue. Excepted and unchanged: the 41
`SCHEDULED(PR-6)` rows (owned by PR-6 batches), the 70 `RETIRED` rows and the 7 `RETAIN_SPECIALIST` rows at base. The final
#2750 end state ("every row RETIRED or RETAIN_SPECIALIST") moves to the last follow-up. #2751 is NOT closed by PR-7; the
FC-24 sum of 66 still holds.

- AC5 (replaces the sentence above): every legacy spec except `RETAIN_SPECIALIST` rows (under `e2e/specialist/` or
  `e2e-parity/`), `e2e/deployed/**`, `SCHEDULED(#issue)` rows and `SCHEDULED(PR-6)` rows is deleted; PR-7 itself deletes no spec.
- The legacy config and runners are KEPT, fenced loopback-only at config load (env vars only: `PLAYWRIGHT_BASE_URL` and
  `BACKEND_BASE_URL` required; `VITE_SUPABASE_URL`, `FRONTEND_BASE_URL`, `VITE_API_BASE_URL`, `OPENSEARCH_URL`, `SUPABASE_DB_HOST`
  when set) and labelled LEGACY until the last `SCHEDULED` row retires. This is NOT a runtime request guard and does not claim
  that no hosted service can be reached: hard-coded hosts in non-editable specs and the frontend build-time Supabase URL are
  outside it (#2854).
  `scripts/run-e2e-local.sh` is kept as a fail-closed refusal because it has no non-hosted route. Their removal and any
  re-enabling through a local-auth route are follow-up work (#2854).
- Guard tightening (C7) is deferred to the follow-up that retires the last `SCHEDULED` row. PR-7 adds only the fail-closed
  `SCHEDULED(#NNNN)` grammar.
- Amendment 2 (reviewed): exactly one existing guard test case, `scripts/e2e/check-e2e-estate.test.mjs` "real repo: ... home
  check", was re-keyed from the decision column to the status column plus a companion `SCHEDULED(#NNNN)` + matching-slice
  assertion; see `docs/testing/e2e-retirement-map-pr7.md`.
