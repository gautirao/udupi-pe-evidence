# Issue #1779 — Source Feasibility Matrix (Template + Current Knowledge)

**Status:** template + best-current-knowledge pre-fill. **No source in this document is approved.** Every source is disabled until its row passes the [source approval gate](#source-approval-gate-checklist) and the approval is recorded here with evidence links.

## Standing policy

- Do not assume any portal is allowed. Uncertainty in any column ⇒ **RESEARCH_ONLY**.
- **Housing.com, 99acres, MagicBricks, and NoBroker are NOT implementation targets.** They are RESEARCH_ONLY by default, with no crawling enabled and no adapter implementation beyond a disabled placeholder, unless and until their row is explicitly approved.
- Sources permissioned by construction (manual CSV entry, broker/dealer exports voluntarily provided) are ENABLE_CANDIDATEs but still require the approval gate (minus robots/ToS columns, which are N/A).
- No anti-bot bypass, ever. No scraping behind login, ever. No personal contact data, no copied photos, no long copied descriptions, regardless of source.

## Matrix columns

| Column | Values | Notes |
|---|---|---|
| `source_id` | slug | e.g. `manual_csv`, `broker_export`, `housing_com` |
| `listing_types` | list | residential_sale / residential_rent / plot / agricultural |
| `agri_present` | yes / no / partial / unknown | |
| `historical_dates` | yes / no / derived | posted-date visible, or only derivable from snapshot diffing? |
| `coordinates` | exact / approximate / none / unknown | |
| `terms_allow` | yes / no / unclear + citation | ToS clause reference required; excerpt archived in `approvals/` |
| `robots_allow` | yes / no / partial + checked date + paths | robots.txt snapshot archived in `approvals/` |
| `login_required` | yes / no / partial | partial = browse open, details gated |
| `anti_bot` | none / moderate / aggressive / unknown | |
| `api_feed_export` | yes / no / paid / partner | preferred acquisition channel if exists |
| `risk` | low / medium / high | legal + operational combined |
| `recommendation` | ENABLE_CANDIDATE / RESEARCH_ONLY / AVOID | |
| `evidence_link` | path | robots snapshot, ToS excerpt, approval record |

## Pre-filled rows (best current knowledge, 2026-07)

| Source | Listing types | Agri? | Hist. dates | Coords | Terms allow | Robots allow | Login | Anti-bot | API/feed/export | Risk | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Housing.com | residential sale/rent, plots | partial | unknown | approximate | unclear — ToS review outstanding; typical portal ToS prohibits automated extraction | not checked | no (browse) | moderate/unknown | no public API; third-party Apify actor exists (see note) | high | **RESEARCH_ONLY** |
| 99acres | residential, plots, some agri | partial | unknown | unknown | unclear — ToS prohibits scraping (typical) | not checked | partial | aggressive (known bot protection) | no public API | high | **RESEARCH_ONLY** (likely partnership/paid channel only) |
| MagicBricks | residential, plots | partial | unknown | unknown | unclear — ToS prohibition (typical) | not checked | partial | aggressive | no public API | high | **RESEARCH_ONLY** |
| NoBroker | residential, some plots | no/unknown | unknown | unknown | unclear | not checked | yes for contact details; browse partially open | present | no public API | high (owner-listed → elevated personal-data risk) | **RESEARCH_ONLY** |
| Local broker/dealer exports | any (varies) | **yes** | yes (export dates) | sometimes exact (legally sourced) | N/A — permissioned by construction | N/A | N/A | N/A | export (Excel/CSV) | low | **ENABLE_CANDIDATE** — first real adapter (PR4) |
| Manual CSV imports | any | **yes** | yes | as entered | N/A | N/A | N/A | N/A | manual | low | **ENABLE_CANDIDATE** — first real adapter (PR4); ideal for Udupi where portals are thin |
| Paid/licensed providers (PropEquity, Liases Foras, CRE Matrix class) | residential primarily | unknown for agri | yes | varies | licensed | N/A | N/A | N/A | paid | low (once licensed) | **RESEARCH_ONLY** pending quotes + Udupi coverage check |
| Govt/public land-value datasets (Kaveri/IGR Karnataka guidance values, Bhoomi RTC) | land value benchmarks (not listings) | **yes** (agri-relevant) | yes | varies | per-dataset open-data licence — verify each | N/A | varies | varies | public data portals | low–medium | **RESEARCH_ONLY** → ENABLE_CANDIDATE per dataset after licence check; guidance value ≠ asking price but useful calibration series |

**Housing.com/Apify note (#1723 precedent):** the Apify actor `unfenced-group/housing-scraper` covers 11 metros only — Bengaluru works (~1782-listing ceiling), **Udupi and Mangalore are not covered**. Apify being a third party does **not** confer permission from Housing.com; a ToS review is still required before any repeat use. The #1723 import (`data/imports/bangalore-housing-1723/`) predates this gate and is not a standing authorization.

**Key finding:** no compliant automated source currently covers Udupi agricultural listings. Phase 1 data reality = broker exports + manual CSV + synthetic seed.

## Source approval gate checklist

Before **any** real source can be enabled (`enabled: true` in `sources.yaml`), ALL of the following must be completed and recorded in `docs/audit/evidence/property-ingestion-pipeline/approvals/<source_id>.md`:

- [ ] **robots.txt checked and archived** (snapshot file + checked date) — crawl channels only
- [ ] **terms of service reviewed and linked** (clause citation + excerpt) — crawl channels only
- [ ] **login not required** for the data being collected
- [ ] **no anti-bot bypass** involved in any form
- [ ] **no personal contact data** collected (names/phones/emails), unless explicitly permitted in writing
- [ ] **no copied photos** stored; **no long copied descriptions** stored (title ≤ 200 chars, link-not-copy)
- [ ] **rate limit documented** (`max_rate_per_min` in registry + justification)
- [ ] **source-specific approval recorded** in this evidence directory (who approved, when, scope)
- [ ] **dry-run output reviewed** by the approver before first `--execute`

The CLI's compliance gate (`registry.py`) enforces the machine-checkable subset: a crawl-channel source with `enabled: true` but missing `robots_checked`, `terms_reviewed`, or `approval_evidence` fields hard-fails with `ComplianceGateError` before any network I/O.

## Row lifecycle

```
RESEARCH_ONLY ──(all checklist items complete + approver sign-off)──▶ ENABLE_CANDIDATE
ENABLE_CANDIDATE ──(registry fields populated + dry-run reviewed)──▶ enabled locally (never enabled:true in-repo)
any row ──(terms/robots change, complaint, doubt)──▶ back to RESEARCH_ONLY or AVOID
```

Approver: open decision (see implementation-plan.md §10) — proposed: user sign-off with Gate F security-reviewer involvement for any coordinate-bearing source.
