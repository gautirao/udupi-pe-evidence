# Issue #2616 Visual Evidence Manifest

- **Pull Request**: [#2621](https://github.com/gautirao/udupi-property-explorer/pull/2621)
- **Source Hostname**: `http://localhost:5194` / `http://127.0.0.1:5194`
- **Capture Tool**: Playwright Browser Automation (`e2e/capture-issue-2616-evidence.spec.ts`)
- **Captured At**: 2026-09-18T19:42:50Z
- **Candidate Area Used**: `Deepanjali Nagar` (`IN|KA|Bengaluru|Deepanjali Nagar`)
- **Count Parity Assertion**:
  - BEFORE Add (Candidate Row): `1 listing · 0 schools`
  - AFTER Add (Map Member Card): `1 LISTING · 0 schools` (`View homes ›`)
  - Semantics & Values Identical: **YES**

---

## Artifact Inventory & Integrity Verification

| # | Filename | Viewport | Target / Purpose | SHA-256 Hash |
|---|---|---|---|---|
| 1 | `1_residential_search_results_after.png` | 1672x941 | Residential desktop Search Results page (RR Nagar, map, Buy/Rent ink navy, filters, heading, listing cards) | `af3107420380aaf187bbef2318ccc20fbbc456cd7b9e251917b89e561be0ed30` |
| 2 | `2_commercial_search_results_after.png` | 1672x941 | Commercial desktop Search Results page (RR Nagar, map, Commercial filters, subtype/area/price, listings) | `efa03d2670aeb58a9cd812b2562b8d37c65b581a7da76268379aed69319d77fe` |
| 3 | `3_add_nearby_areas_before_add.png` | 1672x941 | Add nearby areas BEFORE ADD (Candidate area rows showing filter-aware listings + school count, e.g. `Deepanjali Nagar — 1 listing · 0 schools`) | `a79d295b42741364c082cee5d29d0fd93feee3699bd46413915f93aa172af055` |
| 4 | `4_add_nearby_areas_after_add.png` | 1672x941 | Add nearby areas AFTER ADD (Draft member map card `Deepanjali Nagar` maintaining EXACT count parity: `1 LISTING · 0 schools` with dark legible text on white card body) | `bc145b6fbe54476db4c9bfd4fcf259c2c21935a9a023707bd545a51966a4ee30` |
| 5 | `5_area_disclosure_removed.png` | 1672x941 | Area disclosure text removal verification (verifying complete removal of built-up/plot size text string) | `bc145b6fbe54476db4c9bfd4fcf259c2c21935a9a023707bd545a51966a4ee30` |
| 6 | `6_responsive_mobile_after.png` | 390x844 | Mobile responsive viewport representation of Search Results page | `c0d656051dc9f275ed4a2beb5642e4b987ce7a72c5cdd3e9085b741354aa8ccc` |

---

## Verification & Invariant Proof

1. **Local Hostname & Stack Provenance**: All browser captures originated from `http://localhost:5194` connected to local Spring Boot backend on `:8094` and local PostGIS database fixture on `:36658`.
2. **PropertySignal Branding Assertion**: Verified visible branding text on body.
3. **Candidate Count Parity & Map Card Wiring**: Verified `DiscoverMapCanvas.tsx` consumes `draftMemberStatsByAreaKey` and applies candidate snapshot counts (`1 listing · 0 schools`) to the map draft card upon candidate addition. Verified `0 schools` is rendered explicitly without being hidden.
4. **Area Disclosure Removal**: Verified string `"Compares built-up area for homes; plot size for plots..."` is absent from search results rendering.
