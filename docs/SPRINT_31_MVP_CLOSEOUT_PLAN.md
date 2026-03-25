# MVP Closeout Plan — Sprint 31+

**Created:** 2026-03-24
**Baseline:** Sprint 30 tagged as `sprint-30-search-ux-data-quality`
**MVP completeness:** ~90%

## Executive summary

The core product is functional: listing lifecycle, broker UX, admin tooling, booking system, trust/verification (Phase 1), ingestion pipeline, map search (with polygon + school overlays), and insights are all built. The remaining work is hardening, production-readiness, and a small number of spec-required features that are missing or incomplete.

Sprint 31 closes the launch blockers. Sprint 32 closes the remaining must-finish items. Sprint 33 is polish and confidence.

## What was completed in Sprint 30

| Issue | Title | PRs |
|-------|-------|-----|
| #585 | Completeness guard failure tests | PR #588 |
| #586 | LIVE to ARCHIVED to DRAFT re-edit | PR #589 |
| #587 | Booking cascade on rejection | PR #590 |
| #393 | Commercial type migration | PR #591 |
| #403 | Draw-on-map freehand search | PR #592 + #593 |
| #407 | School-first search | PR #594 + #595 |

Follow-up fixes: #596 (E2E selectors), #599 (RLS policy + test data), #601 (Hibernate persistence via saveAndFlush), V60 (status enum to VARCHAR), e2e-watch.sh script.

## Remaining validated MVP gaps

### Launch blockers (Sprint 31)

| # | Item | Why | Effort |
|---|------|-----|--------|
| LB-1 | `property_type` enum to VARCHAR (V61) | Same class of latent persistence risk as #601. Not broken today but a time bomb. | 1h |
| LB-2 | Enable Google Sign-In as primary auth | Current auth is email+password only. Google Sign-In is the MVP primary auth per AUTH_STRATEGY_DECISION.md. | 2h |
| LB-3 | Badge expiry scheduled job | Trust spec requires expiry (Location/Photos=18mo, Authority=12mo). Badges are currently permanent. | 2h |

> **Auth direction change (2026-03-25):** MSG91 OTP provider (#552) was previously LB-2. Reclassified to post-MVP per `docs/AUTH_STRATEGY_DECISION.md`. Google Sign-In replaces it as the launch-critical auth item. Trust OTP stub is acceptable for soft launch.

### Must-finish before MVP signoff (Sprint 32)

| # | Item | Why | Effort |
|---|------|-----|--------|
| MF-1 | Trust badges on search cards | Spec requires top-2 badges on browse. Only shown on detail page today. | 2h |
| MF-2 | Wire guard stubs in ListingTransitionPolicy | Stubs are TODO. Logic exists inline but policy-level guards are never called. | 1h |

### Should-fix if time permits (Sprint 33)

| # | Item | Why | Effort |
|---|------|-----|--------|
| SF-1 | Image upload 5MB client-side validation | Text says "5 MB" but no check. | 30m |
| SF-2 | Remove legacy dealer pages | Dead code in src/pages/dealer/. | 30m |
| SF-3 | Testcontainers integration tests | Issue #605. High leverage for regression prevention. | 3h |
| SF-4 | Commercial property spec alignment | MVP spec says "total_area" but code uses carpet_area + granular types. | 30m |

### Post-MVP / defer

- MSG91 OTP provider — WhatsApp OTP for trust verification (Phase 1.5, issue #552)
- SMS OTP for login (Phase 2, requires DLT registration)
- Draw-on-map URL state persistence
- School search E2E tests
- Broker reputation model (Phase 2/3)
- Video URL field cleanup
- Documents + Field dimension expiry (Phase 2/3)
- Commute time isochrone search (#404)
- View tracking infrastructure (#383)
- Mobile-first responsive design (#378)

## Recommended implementation order

1. V61 property_type enum to VARCHAR (same pattern as V60, zero functional change)
2. Enable Google Sign-In (Supabase config + frontend login page update)
3. Badge expiry scheduled job (new @Scheduled job, no migration)
4. Trust badges on search cards (trust_tier column exists, render in popup)
5. Wire guard stubs (connect policy stubs to inline validation)
6. Image 5MB validation (client-side file.size check)
7. Remove legacy dealer pages (delete src/pages/dealer/)
8. Testcontainers integration tests (ListingLifecycleIT)
9. Commercial spec alignment (doc update)

> MSG91 OTP provider (#552) moved to post-MVP. See `docs/AUTH_STRATEGY_DECISION.md`.

## Sprint assignment

### Sprint 31 — Launch blockers
- V61 property_type enum to VARCHAR
- Enable Google Sign-In as primary auth (new issue)
- Badge expiry scheduled job

### Sprint 32 — MVP signoff essentials
- Trust badges on search cards
- Wire guard stubs in ListingTransitionPolicy

### Sprint 33 — Quality / cleanup / confidence
- Image 5MB client-side validation
- Remove legacy dealer pages
- Testcontainers integration tests (#605)
- Commercial property spec alignment

## Dependency notes

- V61 migration depends on V60 (done). Same pattern: drop RLS policies referencing the column, alter type, recreate policies.
- MSG91 provider has no code dependencies. Requires MSG91 account + API key as env vars.
- Badge expiry job depends on the existing `listing_verification_dimension` table (V47). No migration needed.
- Trust badges on search cards can use the existing `trust_tier` column on `property_listings` (V46).
- Guard stub wiring depends on no other change. Pure refactor.

## Testing expectations

| Task | Test type | Expectation |
|------|-----------|-------------|
| V61 migration | Backend unit | All 1299 tests pass. psql verify property_type updates persist. |
| MSG91 provider | Backend unit | Mock MSG91 API, verify request format. No live SMS in tests. |
| Badge expiry | Backend unit | Mock clock, verify expiry detection and revocation. |
| Search card badges | Frontend unit | PropertyMap.test.tsx updated to verify badge rendering. |
| Guard stubs | Backend unit | Policy-level guard tests added. |
| Image 5MB | Frontend unit | Test with oversized file mock. |
| Dealer cleanup | TypeScript check | `npx tsc --noEmit` clean. |
| Testcontainers | Integration | Docker required. `mvn test -Dgroups=integration`. |
| Spec alignment | None | Doc-only change. |

## Definition of MVP closeout / signoff

MVP is considered complete when:
1. All launch blockers are resolved and deployed
2. All must-finish items are resolved and deployed
3. Trust verification works end-to-end with real SMS (staging test)
4. Badge expiry is enforced
5. Full E2E suite passes locally (target: 50/51 pass, 1 skip by design)
6. No known silent data-loss bugs
7. Product owner reviews and approves the remaining should-fix items as acceptable for launch
