=== ROLLING CHECKPOINT START ===
Sprint: Design Polish Sprint 1
GitHub Project: RE Trends (project 1, PVT_kwHOAAVnaM4BSWI7)
Milestone: design-polish-sprint-1

Sprint issues: #744, #745, #746, #747, #748, #749
Enriched specs: SEE .claude/sprint-enriched-specs.md (all unknowns resolved 2026-04-13)

Execution order:
Phase A (serial — AppLayout conflict):
1. ✅ #744 → PR #750 merged — nav rename + logo tagline + CORS fix
2. ✅ #748 → PR #751 merged — marketing landing page (hero, feature cards, footer CTA; /discover alias)

Phase B (parallel after A merges):
3. ✅ #747 → PR #752 merged — GET /api/public/areas/trending backend endpoint (2026-04-13)
4. ✅ #745 → PR #753 merged — listing detail two-column layout + areaKey in ListingResponse (2026-04-13)

Phase C (after #745):
5. ⬜ #746 — map "View Area Overview" button + New badge on listing cards

Phase D (after #747 + #748):
6. ⬜ #749 — wire Trending Localities section on landing page

Pre-flight decisions (all resolved):
- areaKey blocker: add areaKey field to ListingResponse + ListingResponseMapper as part of #745
- Hero search (#748): decorative → /discover, no area pre-selection
- area_key on property_listings confirmed; listing_count_90d confirmed as sort column
- #748 Footer: single "Start Map Search" → /discover (ProtectedRoute bounce removed)
- #746 button: hidden (not disabled) when 0 or >1 areas selected
- #746 "New" badge: UTC-based rolling 7×24h cutoff
- #747 limit >12: silent clamp to 12
- #749 expansion: "Show more" button reveals cards 4–6
- #749 price formatting: ≥1 Cr → "₹X.XX Cr"; ≥1 L and <1 Cr → "₹XX L"

Status: IN PROGRESS · 4/6 complete
Next PR: #746 (Phase C — map View Area Overview button + New badge on listing cards)
=== ROLLING CHECKPOINT END ===
