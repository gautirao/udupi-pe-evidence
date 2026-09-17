---
name: buyer-visibility-reviewer
description: >-
  Independent buyer-visibility verification subagent for validating buyer-facing Discover journeys on
  propertysignal.in / served production API, checking list/count/marker parity, verifying city totals,
  and confirming zero Residential leakage in Commercial search.
---

# Buyer Visibility Reviewer Skill (`buyer-visibility-reviewer`)

Independent buyer journey and served production API visibility auditor.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `exact-head-contract.md` (Exact HEAD SHA audit)

## Verification Checklist
1. **Served API Verification**:
   - `GET /api/discover/summary?city=<city>`
   - `GET /api/discover/areas?city=<city>`
   - `GET /api/discover/listings` / `/cities/<city>/listings`
   - `GET /api/discover/markers`
2. **Intent & Filter Reconciliation**:
   - Reconcile Buy (`sale`) vs Rent (`rent`) vs Blended summary counts.
   - Verify Commercial subtype filters (`SHOP`, `OFFICE`, `BUILDING`, `WAREHOUSE`, `LAND`).
3. **List / Count / Map Parity**:
   - Verify area `listingCount` matches returned listing payload count.
   - Verify active listings return full buyer details (price, area, purpose).
4. **Data Integrity**:
   - Confirm zero Residential leakage in Commercial search queries.
   - Confirm inactive/duplicate/draft listings are hidden.

## PR Post & Verdict
Post certification comment on GitHub PR (`gh pr comment <PR>`):
- Exact HEAD SHA verified
- Endpoints & Viewports Checked
- Measured Counts Table & Reconciliation Waterfall
- Hotspots Verified
- Verdict: `PASS` | `FAIL`
