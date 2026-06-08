# Milestone Closeout — MVP2: Agricultural Land Discovery

**GitHub milestone #31** · 7 closed / 0 open issues
Closeout date: 2026-06-08

---

## 1. Completed issues (7/7 delivered)

| Issue | Title | State |
|---|---|---|
| #1369 | define agricultural discovery product spec | CLOSED |
| #1370 | add agriculture search entry point on Discover | CLOSED |
| #1371 | support agriculture-only area search and counts | CLOSED |
| #1372 | render agriculture clusters on map | CLOSED |
| #1373 | render saved agricultural plot polygons | CLOSED |
| #1374 | add agriculture listing right-panel details | CLOSED |
| #1375 | add E2E coverage for agriculture discovery journey | CLOSED |

All 7 milestone issues are closed. Milestone open-issue count: **0**.

---

## 2. PRs and merge SHAs (all squash-merged to main)

| Issue | PR | Title | Merge SHA | Merged |
|---|---|---|---|---|
| #1369 (spec) | #1376 | docs(product): Agricultural Land MVP1/MVP2 product specs | `8569a485f3695e0db55840cff510478ed7bd0787` | 2026-06-07 |
| #1370 | #1395 | feat: agriculture search entry point | `d492de198ac8831077c4d42e930283367731b16b` | 2026-06-07 |
| #1371 | #1397 | feat: agriculture-only area search and counts | `5d3856075c839a97f272ad49a0f2d37b650abf76` | 2026-06-08 |
| #1372 | #1398 | feat: render agriculture clusters on map | `1a1fbaef7cfe96169c3bff8af6f838a6ba5b62f7` | 2026-06-08 |
| #1373 | #1399 | feat: render saved agricultural plot polygons | `832236d1814c18e42e9d9bc69db6bad08b9303ab` | 2026-06-08 |
| #1374 | #1400 | feat: agriculture listing right-panel details | `db425773c1f088b9c20aeca00720e792da75e1b2` | 2026-06-08 |
| #1375 | #1401 | test: E2E coverage for agriculture discovery journey | `0dc67ab913c370e52cd9e6d0c5f618c436a1442f` | 2026-06-08 |

PR #1376 (product specs, MERGED) is included as it delivered the MVP2 spec that #1369 defined.

---

## 3. Final buyer/searcher capability shipped

A buyer/searcher on Discover can now, end to end:

1. **Enter agriculture mode** — agriculture entry point on Discover (`journey=agri-first`). (#1370)
2. **Search/select an area** — agriculture-scoped area search. (#1371)
3. **See agriculture-only counts** — per-area agricultural listing count + acreage, isolated from residential/school counts. (#1371)
4. **See agriculture clusters** — separate 🌾 cluster layer on the map at area zoom. (#1372)
5. **Zoom to saved plot polygons** — saved agricultural boundaries render as map polygons at zoom ≥16. (#1373)
6. **Click a polygon** — opens the right-panel agriculture detail. (#1373 → #1374)
7. **View the agriculture detail panel** — title, locality, land area, survey/soil/water fields, and the boundary disclaimer. (#1374)

School controls are absent in agriculture mode; the residential journey is unaffected.

---

## 4. Final validation

**#1375 E2E — `e2e/discover-agri-journey-1375.spec.ts`**

- Command: `bash scripts/run-e2e-local.sh --project=full e2e/discover-agri-journey-1375.spec.ts`
- Result: **7 passed, 0 skipped, 0 failed** — exit code 0
- Artefact: `playwright-report/index.html`
- Independently re-run by Main Agent in Phase 7A.

**AC8 specifically** — the initial merge candidate had AC8 as a *conditional skip* (the test clicked the display-only `agri-listing-card`, which has no onClick — a **test design error, not a product defect**). On review hold, AC8 was rewritten to drive the **real product path**: zoom ≥16 → `AgriPolygonLayer` renders the saved boundary → click `.leaflet-overlay-pane path` → `onSelectListing` → `selectedMarkerListing` → `agri-detail` panel. Hard assertions on `agri-detail-panel` + `agri-detail-title` ("Agricultural Plot in Manipal") + `agri-boundary-disclaimer` + a real detail field. **AC8 = PASS (Test 5, 20.6s), no skip.**

**No product code changed in #1375** — scope-locked to exactly one file: `e2e/discover-agri-journey-1375.spec.ts`. No `src/**`, no backend, no migrations, no workflow docs. Verified via `git show --name-only 0dc67ab`.

---

## 5. Deferred / open follow-ups (NOT milestone blockers)

| Issue | Title | Status | Note |
|---|---|---|---|
| #1396 | ux: reduce repeated agricultural-land copy on agri landing panel | OPEN | Copy polish. No milestone assigned — not part of #31; cosmetic. |
| #1387 | feat: Back button on Draw Boundary wizard step | OPEN | Broker/listing-creation track (MVP1), not MVP2 Discover. |
| #1388 | fix: sync URL `?step=` after Skip/Save on boundary step | OPEN | Broker/listing-creation track (MVP1), not MVP2 Discover. |
| #1393 | bug: >100km² boundary validation order on live PostGIS | OPEN | Broker/listing-creation track (MVP1), P3. |

None of these block MVP2 Discovery delivery. #1387/#1388/#1393 are on the separate broker listing-creation track; #1396 is unmilestoned copy polish. These remain open and are intentionally not moved or closed by this closeout.

---

## 6. Outcome

**Milestone #31 (MVP2 — Agricultural Land Discovery) closed.**

All 7 delivery issues (#1369–#1375) are closed; milestone open-issue count is 0; the full buyer journey is shipped and E2E-validated (7/7, AC8 via real polygon click). The open items (#1396 copy polish, #1387/#1388/#1393 broker track) are out of milestone scope and did not block closure.
