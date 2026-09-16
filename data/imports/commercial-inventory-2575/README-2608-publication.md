# Controlled Publication Workflow & Canary Gate for Commercial Inventory (#2608)

This document describes the design, remediation SQL, publication/unpublish mechanisms, canary selection, and testing for **Issue #2608**.

---

## 1. Overview & Goal

In Issue #2575, 3,163 commercial inventory listings across Udupi, Bengaluru, and Mangalore were promoted into `property_listings` with `status = 'DRAFT'`.
Issue #2608 establishes a **controlled, audit-trailed DRAFT -> LIVE publication workflow**, ownership remediation, a 10-listing multi-city canary gate, and an atomic unpublish mechanism.

---

## 2. Phase A — Canonical Ownership Model

### Canonical Principal Identity
- **UUID**: `e7b61f70-d087-44d8-a81d-7f8a057d2775`
- **Email**: `testdealer@example.com`
- **Full Name**: `Test Dealer`
- **Profiles Table**: Present in `public.profiles` (`user_id = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'`).

### Preservation Proof
1. **RLS (`V10__update_rls_for_mvp_roles.sql`)**:
   - `Dealers can view own listings`: requires `has_role(auth.uid(), 'dealer') AND created_by = auth.uid()`.
   - `Admins can manage all listings`: `public.is_admin(auth.uid())`.
   - Updating `created_by` from `00000000-0000-0000-0000-000000000000` (which has no profile) to `e7b61f70-d087-44d8-a81d-7f8a057d2775` ensures that the row has a valid owner profile row in `public.profiles`.
2. **Ownership Guard (`ListingOwnershipGuard.java`)**:
   - `findOwned`: validates caller ownership or admin role. Canonical service principal owner permits authorized broker and admin operations.
3. **Admin Workflows (`claimScrapedListing`)**:
   - Admin claim functionality checks for assigned owner; assigning `e7b61f70-d087-44d8-a81d-7f8a057d2775` marks the imported listings with their canonical service account owner.
4. **Card Attribution**:
   - Profile join (`property_listings.created_by` -> `profiles.user_id`) resolves cleanly to `Test Dealer` rather than a missing profile row.

### Remediation Scripts
- `remediate-ownership-2608.sql`: Idempotent UPDATE targeting ONLY promoted commercial listings.
- `remediate-ownership-2608-rollback.sql`: Reverts `created_by` back to nil UUID for DRAFT listings.

---

## 3. Phase B — Controlled Publication & Unpublish Workflow

### Audit Infrastructure (`V137__commercial_publication_batch.sql`)
Migration V137 creates `public.commercial_publication_batch`:
- `id` (SERIAL PRIMARY KEY)
- `batch_name` (TEXT)
- `batch_type` (`CANARY`, `BATCH`, `UNPUBLISH`)
- `target_listing_count` (INTEGER)
- `listing_ids` (UUID[])
- `published_by` (UUID)
- `previous_status` (TEXT)
- `new_status` (TEXT)
- `published_at` (TIMESTAMPTZ)

### Operational Scripts
1. `publish-canary.sql`: Enforces Phase C quality gate, publishes 10 canary listings (`DRAFT` -> `LIVE`), writes `CANARY` audit entry.
2. `unpublish-canary.sql`: Reverts 10 canary listings (`LIVE` -> `DRAFT`), writes `UNPUBLISH` audit entry.
3. `publish-batch.sql`: Enforces Phase C quality gate, bulk publishes eligible commercial listings (`DRAFT` -> `LIVE`), writes `BATCH` audit entry.
4. `unpublish-batch.sql`: Bulk unpublishes commercial listings (`LIVE` -> `DRAFT`), writes `UNPUBLISH` audit entry.

---

## 4. Phase C — Final Data-Quality Gate

Every publication script enforces the following mandatory contract rules before changing status to `LIVE`:
1. `title`: NOT NULL and non-empty string.
2. `created_by`: NOT NULL and `!= '00000000-0000-0000-0000-000000000000'`.
3. `area_resolution_status`: MUST be `'RESOLVED'`.
4. `listing_family`: MUST be `'COMMERCIAL'`.
5. `commercial_subtype`: MUST be one of `'SHOP'`, `'OFFICE'`, `'BUILDING'`, `'WAREHOUSE'`, `'LAND'`.
6. `listing_purpose` & Money agreement:
   - `sale` -> `price IS NOT NULL` AND `monthly_rent IS NULL`.
   - `rent` -> `monthly_rent IS NOT NULL` AND `price IS NULL`.

---

## 5. Phase D — Deterministic Canary Selection

10 canary listings were selected deterministically across Udupi, Bengaluru, and Mangalore:

| Listing UUID | Source ID | City | Subtype | Title |
|---|---|---|---|---|
| `15bd7df2-b578-6405-ca23-8f39f794d572` | `99acres:Y92487718` | Udupi | SHOP | Showroom for sale in Manipal |
| `8e0896c4-bb5d-a9d8-0dd8-29a87f52380c` | `99acres:M91395690` | Udupi | OFFICE | Ready to move Office Space |
| `05be37a2-6eca-2193-4cad-14109b966d87` | `99acres:V92668720` | Udupi | LAND | Commercial plot / Land for sale |
| `bbfe8c07-3fd2-90e0-c194-cb8607dff8c3` | `99acres:A68945876` | Bengaluru | SHOP | Shop for sale in Rajajinagar |
| `f335fc24-0ef8-cbf0-bfa8-177c94b5b8f5` | `99acres:D94189536` | Bengaluru | OFFICE | Bare shell Office Space for sale |
| `ea2b6b68-87f6-4f5e-b34c-59b2c082321a` | `99acres:W94256632` | Bengaluru | WAREHOUSE | Warehouse for sale in Chennakeshava Nagar |
| `c3b513e7-ee12-46c6-a1bc-513d66f22c22` | `99acres:K92019122` | Bengaluru | LAND | Commercial plot / Land for sale |
| `f96a87cd-8670-815b-e35d-bdbaadfb78ce` | `99acres:K93076034` | Mangalore | SHOP | Shop for sale in Kadri |
| `a3bad877-bc47-deba-c588-9d5b7e136c20` | `99acres:I93138370` | Mangalore | OFFICE | Ready to move Office Space |
| `964bb405-df45-1f7b-4d7d-4eaab56def14` | `99acres:T92134736` | Mangalore | WAREHOUSE | Warehouse for sale in Bunder |

---

## 6. Phase E — Automated Verification

- **Java Integration Suite (`CommercialPublication2608IT.java`)**: 14 tests covering ownership remediation, idempotency, bounded scope, rollback, all data quality gate rejections, canary publish/unpublish, batch publish/unpublish, and Discover predicate visibility.
- **Python Verification Suite (`test_publication_2608.py`)**: 2 tests validating candidate data quality and canary selection determinism.

```bash
mvn -f apps/api/pom.xml test -Dtest=CommercialPublication2608IT -DfailIfNoTests=true -Dsurefire.failIfNoSpecifiedTests=true
python3 data/imports/commercial-inventory-2575/test_publication_2608.py
```

---

## 7. Phase F — Cache & Discover Architecture

### Discover Reading Path
- Queries in `DiscoverListingPredicateBuilder.java` filter using:
  `pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false`
- Listings with `status = 'DRAFT'` remain completely invisible to buyers until published to `'LIVE'`.

### Cache & Refresh Requirements
- Area summary counts and city search results cached in memory / Redis must be invalidated when a publication batch or canary transition (`DRAFT` <-> `LIVE`) executes.
- `AreaSummaryService` / search index outbox events must be emitted when listing status transitions to `LIVE` to trigger search index refresh.
