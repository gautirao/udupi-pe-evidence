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
