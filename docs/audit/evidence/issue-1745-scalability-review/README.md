# Issue #1745: Unified Discover Portal — Scalability & Implementation Review

**Date:** 2026-07-05  
**Reviewer:** Antigravity (Agentic AI Coding Assistant)  
**Status:** **MERGE_OK_WITH_FOLLOWUPS** — Safe at current scale; scale-hardening follow-ups created for 100k+ listings and high concurrency.

---

## Executive Summary

Before finalizing the merge of Issue #1745 (Unified Discover Portal — 4-level hierarchy: City → Macro Region → Zone/Corridor → Area → Listings), an engineering review was conducted to evaluate architectural correctness, scalability posture at 100k+ listings, and regression proofing across UI/map state synchronization.

The investigation confirmed that the implementation is **safe at current scale (~2,000 listings), structurally sound, and ready for merge with assigned follow-ups**. 

### Assigned Milestone 33 Follow-Up Issues
To ensure robust scalability at 100k+ listings, high concurrency, and complete taxonomy representation, the following dedicated follow-up issues have been created and assigned to Milestone 33:
- **#1760** — `perf(discover): add summary rollup/cache for 100k+ listing scale` (backend summary rollup/cache/OpenSearch-backed summary adapter)
- **#1761** — `data(discover): reduce Other Bangalore by completing macro-region mapping` (reducing Other Bangalore through macro-region/area-group mapping completion and adding/confirming West Bangalore taxonomy)
- **#1762** — `perf(discover): harden dense-area listing marker rendering` (dense-area marker rendering hardening)

---

## Scale Posture Summary

- **Count Source:** Macro-region counts come from `GET /api/discover/summary`, specifically `summary.regions[].listingCount`.
- **Zero Client Aggregation:** The frontend does not aggregate listing counts or corridor-card counts.
- **Backend Architecture:** The current backend summary implementation is live JDBC `GROUP BY` behind `DiscoverSummaryPort`.
- **Query Performance:** `EXPLAIN ANALYZE` is fast at current scale, around 1.9ms–8.1ms on roughly 2k listings, with index scans and no sequential scan over `property_listings`.
- **100k+ Path:** The 100k+ listing/high-concurrency path is tracked separately in **#1760**.
- **Map Layering:** City/region/corridor map states render bounded summary layers, not listing-marker layers.
- **Marker Scope:** Listing markers appear only at selected area/listing level.
- **Dense Marker Hardening:** Dense marker rendering is tracked separately in **#1762**.

---

## Data-Quality Caveat & Count Reconciliation

Current Bangalore count reconciliation from `GET /api/discover/summary?city=bangalore&listingPurpose=sale`:
- **East Bangalore:** `165`
- **North Bangalore:** `82`
- **South Bangalore:** `37`
- **Other Bangalore:** `1,453`
- **Total:** `1,737`

**Key Observations:**
- **Other Bangalore** is the fallback/unmapped bucket (catching active listings whose localities are not yet mapped in `area_group_members`).
- **West Bangalore** is absent because the current data mapping has no separate West bucket.
- Reducing Other Bangalore and adding/confirming West Bangalore taxonomy is tracked in **#1761**.

---

## Summary Table of Review Concerns

| # | Concern Area | Status | Key Finding / Verdict |
|---|---|---|---|
| **1** | **Macro-Region Count Source** | **PASS** | `useDiscoverSummary` fetches direct aggregates from `/api/discover/summary`. No client-side card summing or scraping occurs. |
| **2** | **Backend Summary Architecture** | **MERGE_OK_WITH_FOLLOWUPS** | Live JDBC `GROUP BY` is fast at current scale (~2k listings). Tracked for 100k+ scale in **#1760**. |
| **3** | **Query Performance (EXPLAIN)** | **PASS** | Queries execute via index scans (`idx_listing_area_key_status_created`, `uq_areas_city_id_area_slug`) in **1.9ms – 8.1ms**. No sequential scans over listings. |
| **4** | **"Other Bangalore" Mapping** | **MERGE_OK_WITH_FOLLOWUPS** | Reconciles exactly to `1,737`. 1,453 fall into Other due to incomplete `area_group_members` seeding. Tracked in **#1761**. |
| **5** | **Map / Marker Scaling** | **MERGE_OK_WITH_FOLLOWUPS** | Area layers hide above zoom 12. Dense marker rendering hardening is tracked in **#1762**. |
| **6** | **Buy / Rent Stability** | **PASS** | `listingPurpose` is bound to query keys and backend SQL predicates. Switching Buy $\leftrightarrow$ Rent cleanly refetches and caches stable counts. |
| **7** | **Scope / Hierarchy Lockstep** | **PASS** | Map layers and right panels read identical state from `useDiscoverUrlState`, `selectedArea`, and `focusedGroup`. Impossible to desync hierarchy levels. |
| **8** | **School Radius Popup (#1738)** | **PASS** | Issue #1738 cleanly fixed popover gating during `area-first` school selection (`isAreaFirstPopoverEligible`). Clicking popover CTA navigates to `/listing/{id}` without breaking context. |

---

## Final PR & Visual Polish Guidance

- **Closing Wording:** #1745 closes the functional unified hierarchy, with visual parity to continue page-by-page. The PR body explicitly references **#1760**, **#1761**, and **#1762** as Milestone 33 follow-ups before using “Closes #1745”.
- **Visual Parity:** While the 4-level functional hierarchy, routing, and map/panel lockstep are complete, detailed visual polish (page-by-page styling matching the Claude Design mock) will continue iteratively in subsequent visual-polish follow-ups.

---

## Evidence Artifacts Directory

All supporting evidence files generated during this review are archived in `/docs/audit/evidence/issue-1745-scalability-review/`:
- [`README.md`](file:///Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer/docs/audit/evidence/issue-1745-scalability-review/README.md) — This comprehensive audit report.
- [`other-bangalore-analysis.md`](file:///Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer/docs/audit/evidence/issue-1745-scalability-review/other-bangalore-analysis.md) — Deep-dive mathematical and SQL analysis of unmapped listings and fallback behavior.
- [`explain-summary.txt`](file:///Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer/docs/audit/evidence/issue-1745-scalability-review/explain-summary.txt) — Full `EXPLAIN ANALYZE` database execution plans for Sale and Rent summary queries.
- [`summary-sale.json`](file:///Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer/docs/audit/evidence/issue-1745-scalability-review/summary-sale.json) — Raw API response for `GET /api/discover/summary?city=bangalore&listingPurpose=sale`.
- [`summary-rent.json`](file:///Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer/docs/audit/evidence/issue-1745-scalability-review/summary-rent.json) — Raw API response for `GET /api/discover/summary?city=bangalore&listingPurpose=rent`.
- [`area-groups.json`](file:///Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer/docs/audit/evidence/issue-1745-scalability-review/area-groups.json) — Raw API response for `GET /api/discover/area-groups?city=bangalore`.
