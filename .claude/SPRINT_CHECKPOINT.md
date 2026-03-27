=== ROLLING CHECKPOINT START ===
Sprint: Sprint 30 — Search UX & Data Quality
GitHub Project: RE Trends (project 1, PVT_kwHOAAVnaM4BSWI7)

Sprint iteration ID: 0a7f4c26

Sprint issues (open, assigned to Sprint 30):
- #612 docs(spec): align commercial property spec with implemented granular types
- #606 fix(backend): V61 convert property_type enum to VARCHAR
- #611 chore(frontend): remove legacy src/pages/dealer/ duplication
- #610 fix(ui): enforce 5MB file size limit in ImageUploader
- #605 feat(test): Add Testcontainers integration tests for listing lifecycle persistence
- #607 feat(trust): scheduled job to revoke expired trust badges
- #609 refactor(workflow): wire ListingTransitionPolicy guard stubs to existing validation
- #378 [RE-82] Dealer UX: Mobile-First Responsive Design for Listing Management
- #488 [RE-180] Extract shared listing form constants from NewListing/EditListing (F-6)
- #608 feat(ui): show trust badges on search cards / map results
- #613 feat(auth): enable Google Sign-In as primary MVP auth method
- #614 feat(backend): anonymous teaser data contract — redacted public listing endpoints
- #615 feat(frontend): anonymous teaser home experience — public map with teaser cards
- #616 feat(frontend): listing detail login gate with deep-link returnTo
- #617 feat(frontend): authenticated full discovery unlock — remove teaser restrictions post-login
- #618 test: anonymous teaser discovery — backend contract + E2E gate flows

Execution order:
1. #612 (docs-only, zero risk)
2. #606 (backend migration, V61)
3. #611 (frontend chore, delete dealer/)
4. #610 (frontend fix, ImageUploader)
5. #605 (backend test infra, Testcontainers)
6. #607 (backend feature, BadgeExpiryJob)
7. #609 (backend refactor, ListingTransitionPolicy)
8. #378 (frontend UX fixes, desktop P0+P1)
9. #488 (frontend refactor, shared constants)
10. #608 (frontend feature, trust badges on cards)
11. #613 (frontend feature, Google Sign-In)
12. #614 (backend feature, teaser data contract)
13. #615 (frontend feature, anonymous teaser home)
14. #616 (frontend feature, listing detail login gate)
15. #617 (frontend feature, full discovery unlock)
16. #618 (test, anonymous teaser E2E)

Dependencies:
- #488 depends on #378 [confirmed — both touch NewListing.tsx + EditListing.tsx]
- #615 depends on #614 [confirmed — needs /api/public/listings/discovery endpoint]
- #616 depends on #614 [confirmed], sequenced after #615 [likely]
- #617 depends on #615 and #616 [confirmed]
- #618 depends on #614, #615, #616, #617 [confirmed]
- #613 sequenced before #615 and #616 [likely — shared App.tsx and Auth.tsx]
- #608 sequenced before #615 (shared Index.tsx) [likely]

Security flags:
- #614: invalid JWT = 401, no token = anonymous (do NOT silently downgrade to teaser on invalid token)
- #614+#615: coordinated API/FE contract change — ship together or preserve backward compat until #615 merges
- #616: returnTo must be sanitised (relative paths only, block open redirect)
- #613: security-reviewer before merge

Enriched specs: SEE .claude/sprint-enriched-specs.md

Project item IDs:
#612 → PVTI_lAHOAAVnaM4BSWI7zgoPdrg
#606 → PVTI_lAHOAAVnaM4BSWI7zgoPdpI
#611 → PVTI_lAHOAAVnaM4BSWI7zgoPdqw
#610 → PVTI_lAHOAAVnaM4BSWI7zgoPdqk
#605 → PVTI_lAHOAAVnaM4BSWI7zgoNGeo
#607 → PVTI_lAHOAAVnaM4BSWI7zgoPdpk
#609 → PVTI_lAHOAAVnaM4BSWI7zgoPdqc
#378 → PVTI_lAHOAAVnaM4BSWI7zgn-wxw
#488 → PVTI_lAHOAAVnaM4BSWI7zgofiOE
#608 → PVTI_lAHOAAVnaM4BSWI7zgoPdqE
#613 → PVTI_lAHOAAVnaM4BSWI7zgoQ5d0
#614 → PVTI_lAHOAAVnaM4BSWI7zgofiOM
#615 → PVTI_lAHOAAVnaM4BSWI7zgofiOQ
#616 → PVTI_lAHOAAVnaM4BSWI7zgofiOU
#617 → PVTI_lAHOAAVnaM4BSWI7zgofiOY
#618 → PVTI_lAHOAAVnaM4BSWI7zgofiOc

Previously completed: #612 ✅ PR #619 | #606 ✅ PR #620 | #611 ✅ PR #621 | #610 ✅ PR #622 | #605 ✅ PR #623

Remaining execution order: #607 → #609 → #378 → #488 → #608 → #613 → #614 → #615 → #616 → #617 → #618

Status: IN_PROGRESS · 5/16 complete

Next PR: #607 — feat(trust): scheduled job to revoke expired trust badges
=== ROLLING CHECKPOINT END ===
