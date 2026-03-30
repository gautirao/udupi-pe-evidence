=== ROLLING CHECKPOINT START ===
Sprint: Sprint 32 — E2E Fidelity Refactor
GitHub Project: RE Trends (project 1, PVT_kwHOAAVnaM4BSWI7)

Sprint iteration ID: none (Sprint 32 iteration not yet created in GitHub project; issues added to project without sprint assignment)

Sprint issues (child issues under umbrella #665):
- #666 feat(e2e): booking UI journey — request viewing modal end-to-end
- #667 fix(e2e): DL1 image upload — replace React fiber introspection with standard file input
- #668 fix(e2e): remove weak assertions and waitForTimeout across suite
- #669 feat(e2e): admin moderation journey — approve and reject listings via UI
- #670 feat(e2e): saved areas journey — save area, delete area, alert toggle
- #671 refactor(e2e): move API-only backend tests out of Playwright
- #672 chore(e2e): Playwright config — smoke/journey/integration-ui project split + CI update

Execution order (single-stream, SPRINT_EXECUTOR default):
1. #666 (booking journey — creates e2e/journey/ directory)
2. #667 (DL1 image upload fix — independent)
3. #668 (remove waitForTimeout + weak assertions — confirmed files only)
4. #669 (admin moderation journey — creates e2e/journey/admin-moderation.spec.ts; deletes L4 from listing-lifecycle.spec.ts)
5. #670 (saved areas journey — SA2+SA3 only pending SA1 decision; BLOCKED on user confirmation)
6. #671 (move API-only tests — listing-lifecycle.spec.ts BC1; must follow #669 to avoid merge conflict)
7. #672 (playwright.config.ts + CI — must be last; e2e/journey/ must exist)

Dependencies:
- #672 depends on #666, #669, #670 [confirmed — e2e/journey/ must exist before config references it]
- #671 depends on #669 [confirmed — both modify listing-lifecycle.spec.ts; #669 owns L4 deletion, #671 owns BC1 deletion]
- #670 BLOCKED on #673 [confirmed — Option B chosen; useSaveArea() has zero callers; #673 must ship first]

File conflict map:
- listing-lifecycle.spec.ts: #669 (L4 deletion) → #671 (BC1 deletion) [serialized, #669 first]
- e2e/journey/ (new dir): #666 creates it; #669, #670 add files to it
- All other files: touched by at most one issue

Spec corrections applied (team-lead findings):
- BC1 lives in listing-lifecycle.spec.ts (lines 552-698), NOT user-journeys.spec.ts — #668 and #671 scopes corrected
- #668 scope for user-journeys.spec.ts: U4 waitForTimeout removal only (line ~161)
- map-filters.spec.ts has zero waitForTimeout calls — removed from #668 scope

Cached routing: test/e2e → frontend-engineer (primary) + code-reviewer; exception: #671 → backend-engineer if Java tests added

Project item IDs:
#665 → PVTI_lAHOAAVnaM4BSWI7zgonCQU (umbrella — track only)
#666 → PVTI_lAHOAAVnaM4BSWI7zgonCRE
#667 → PVTI_lAHOAAVnaM4BSWI7zgonCRw
#668 → PVTI_lAHOAAVnaM4BSWI7zgonCSg
#669 → PVTI_lAHOAAVnaM4BSWI7zgonCTY
#670 → PVTI_lAHOAAVnaM4BSWI7zgonCUU
#671 → PVTI_lAHOAAVnaM4BSWI7zgonCVI
#672 → PVTI_lAHOAAVnaM4BSWI7zgonCWA

Enriched specs: SEE .claude/sprint-enriched-specs.md

Previously completed: (none)

Previously completed:
- #666 → PR #674 merged — booking UI journey UB1/UB2/UB3
- #667 → PR #675 merged — fiber walk removed, DragEvent confirmed via DL1 pass
- #668 → PR #676 merged — waitForTimeout replaced (P2: waitForResponse, U4: Supabase RPC wait)
- #669 → PR #677 merged — admin moderation journey AM1/AM2/AM3 (fixed: /admin/listings/pending route, beforeAll submission steps, toast .first(), Card selector)
- #671 → PR #678 merged — BC1 deleted; cascade covered by BookingCascadeServiceTest + ListingWorkflowServiceTest
- #672 → PR #679 merged — smoke/journey/integration-ui project split, CI updated, 3 new npm scripts

Remaining:
- #670 ← BLOCKED on #673 (Save Area UI must exist first)

Status: COMPLETE · 5/6 complete (#670 blocked/deferred)

Note: GH CI bypassed — local E2E is the gate. Run with `rtk playwright` / `bash scripts/run-e2e-local.sh`. Merge via `rtk gh pr merge <N> --squash --admin`.

Status: COMPLETE · 5/6 complete (#670 blocked/deferred)
=== ROLLING CHECKPOINT END ===
