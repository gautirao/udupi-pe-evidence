=== ROLLING CHECKPOINT START ===
Sprint: Sprint 26 — Trust Services + Lifecycle UI
GitHub Project: RE Trends (project 1, PVT_kwHOAAVnaM4BSWI7)
Current sprint iteration ID: 01989418
Project item IDs: #443 → PVTI_lAHOAAVnaM4BSWI7zgn-wqs | #444 → PVTI_lAHOAAVnaM4BSWI7zgn-wrA | #446 → PVTI_lAHOAAVnaM4BSWI7zgn-wrg | #448 → PVTI_lAHOAAVnaM4BSWI7zgn-wrs | #449 → PVTI_lAHOAAVnaM4BSWI7zgn-wsM | #451 → PVTI_lAHOAAVnaM4BSWI7zgn-wsY | #452 → PVTI_lAHOAAVnaM4BSWI7zgn-wso
Sprint issues: #443 RE-142 | #444 RE-143 | #446 RE-144 | #448 RE-145 | #449 RE-146 | #451 RE-147 | #452 RE-148
Execution order: RE-142 | RE-143 | RE-144 | RE-145 | RE-146 | RE-147 | RE-148

Dependencies:
- RE-143 depends on RE-142 [confirmed — Flyway V47 requires V46 first]
- RE-144 depends on RE-143 [confirmed — Flyway V48 requires V47]
- RE-145 depends on RE-144 [confirmed — Flyway V49 requires V48]
- RE-146 depends on RE-145 [confirmed — Flyway V50 requires V49]
- RE-147 depends on RE-143, RE-144, RE-145 [confirmed — entities map to tables created in V47/V48/V49]
- RE-148 depends on RE-147 [confirmed — TrustTierCalculator reads repositories from RE-147]

Pre-review flags:
- RE-143: security-reviewer required (RLS on listing_verification_dimension)
- RE-144: security-reviewer required (RLS on authority_evidence — owner-scoped access)
- RE-145: security-reviewer required (RLS on listing_complaint — non-owner INSERT constraint)

Completed: RE-142 ✅ PR #531 | RE-143 ✅ PR #532 | RE-144 ✅ PR #533

Status: IN PROGRESS — RE-145 next

---

Enriched specs:

### RE-142 — V46: Add trust_tier and ranking_score to property_listings
**AC:**
1. V46 migration runs cleanly on a clean DB and on a DB with existing rows
2. All existing rows get trust_tier='D', ranking_score=0 via column defaults
3. `trust_tier VARCHAR(1) NOT NULL DEFAULT 'D'`
4. `ranking_score INTEGER NOT NULL DEFAULT 0`
5. Both columns are present with correct types and constraints

**Out of scope:** Computing or updating trust_tier / ranking_score values (deferred to RE-148 / TrustTierCalculator)
**Key constraint:** Safe defaults — no backfill query needed, defaults handle existing rows

---

### RE-143 — V47: Create listing_verification_dimension table + RLS
**Schema:**
- id UUID PK DEFAULT gen_random_uuid()
- listing_id UUID FK → property_listings ON DELETE CASCADE NOT NULL
- dimension_type VARCHAR(20) NOT NULL — values: IDENTITY, LOCATION, PHOTOS, AUTHORITY, DOCUMENTS, FIELD
- badge_state VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' — values: AVAILABLE, PENDING, EARNED, EXPIRED, SUSPENDED
- granted_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, suspended_at TIMESTAMPTZ (all nullable)
- created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

**RLS (resolved):**
- INSERT/UPDATE/DELETE: backend service role only (not listing owner directly)
- SELECT: publicly readable for LIVE listings (sanitized public view); owner-only for non-LIVE listings
- FK ON DELETE: CASCADE (dimension rows are deleted when listing is deleted)

**AC:**
1. V47 migration runs cleanly
2. FK constraint enforced with ON DELETE CASCADE
3. RLS policies in place: public read for LIVE listing dimensions, service-role write
4. Unique constraint on (listing_id, dimension_type) — one row per dimension per listing

---

### RE-144 — V48: Create authority_evidence table + RLS
**Schema:**
- id UUID PK DEFAULT gen_random_uuid()
- listing_id UUID FK → property_listings ON DELETE CASCADE NOT NULL
- evidence_type VARCHAR(30) NOT NULL — values: OWNER_OTP, MANDATE_DOCUMENT, RERA_NUMBER
- evidence_value TEXT — free-text (RERA number, storage path, OTP token); max 2000 chars enforced at app level
- verified_at TIMESTAMPTZ, verified_by UUID (nullable)
- review_state VARCHAR(20) NOT NULL DEFAULT 'PENDING' — enum: PENDING, APPROVED, REJECTED, EXPIRED
- created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

**RLS (resolved):**
- INSERT: broker/owner AND admin can insert
- UPDATE/DELETE: backend service role only
- SELECT: listing owner can read own evidence; admin can read all

**AC:**
1. V48 migration runs cleanly
2. FK constraint with ON DELETE CASCADE
3. review_state constrained to (PENDING, APPROVED, REJECTED, EXPIRED)
4. RLS policies: owner can INSERT and SELECT own evidence; admin can do all; service role write for UPDATE/DELETE

---

### RE-145 — V49: Create listing_complaint table + RLS
**Schema:**
- id UUID PK DEFAULT gen_random_uuid()
- listing_id UUID FK → property_listings ON DELETE CASCADE NOT NULL
- complainant_id UUID FK → auth.users NOT NULL
- complaint_type VARCHAR(30) NOT NULL — values: FAKE_LISTING, WRONG_PRICE, UNAVAILABLE, OTHER
- description TEXT (nullable)
- status VARCHAR(20) NOT NULL DEFAULT 'OPEN' — values: OPEN, UNDER_REVIEW, RESOLVED, DISMISSED
- resolved_at TIMESTAMPTZ, resolved_by UUID (nullable)
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

**Constraints (resolved):**
- UNIQUE (listing_id, complainant_id) — one complaint per user per listing
- Listing owner cannot complain about own listing: enforce via CHECK or app-level guard

**RLS (resolved):**
- INSERT: any authenticated user except the listing owner
- SELECT: complainant can read own complaints; admin can read all
- UPDATE: admin only (for status transitions)

**AC:**
1. V49 migration runs cleanly
2. UNIQUE constraint on (listing_id, complainant_id) enforced
3. updated_at column present
4. RLS policies: authenticated INSERT (non-owner), complainant read-own, admin full access

---

### RE-146 — V50: Add trust columns to profiles table
**Schema additions to `profiles`:**
- phone_verified BOOLEAN NOT NULL DEFAULT false
- org_name VARCHAR(200) (nullable)
- rera_broker_id VARCHAR(100) (nullable)
- reputation_score INTEGER NOT NULL DEFAULT 0

**AC:**
1. V50 migration runs cleanly
2. All existing profiles rows get safe defaults (false, null, null, 0)
3. Columns present with correct types and constraints

---

### RE-147 — JPA entities for all trust tables
**Files:**
- `trust/ListingVerificationDimension.java` + `ListingVerificationDimensionRepository.java`
- `trust/AuthorityEvidence.java` + `AuthorityEvidenceRepository.java`
- `trust/ListingComplaint.java` + `ListingComplaintRepository.java`

**Repository methods (resolved):**
- ListingVerificationDimensionRepository:
  - findAllByListingId(UUID listingId)
  - findByListingIdAndDimensionType(UUID listingId, String dimensionType)
  - existsByListingIdAndDimensionType(UUID listingId, String dimensionType)
  - deleteByListingId(UUID listingId)
- AuthorityEvidenceRepository:
  - findAllByListingId(UUID listingId)
  - findAllByListingIdOrderByCreatedAtDesc(UUID listingId)
  - findByListingIdAndEvidenceType(UUID listingId, String evidenceType)
  - findAllByListingIdAndReviewState(UUID listingId, String reviewState)
- ListingComplaintRepository:
  - findAllByListingIdOrderByCreatedAtDesc(UUID listingId)
  - findAllByComplainantIdOrderByCreatedAtDesc(UUID complainantId)
  - existsByListingIdAndComplainantId(UUID listingId, UUID complainantId)
  - findByListingIdAndComplainantId(UUID listingId, UUID complainantId)

**AC:**
1. All 3 entity classes compile cleanly with correct `@Entity`, `@Table`, `@Column` annotations
2. All 4+4+4 repository methods present and match schema column names
3. Unit tests cover at minimum: findAllByListingId (all 3 repos), findByListingIdAndDimensionType, existsByListingIdAndComplainantId

---

### RE-148 — TrustTierCalculator service
**Tier rules:**
- **Tier A:** IDENTITY(EARNED) + AUTHORITY(EARNED) + PHOTOS(EARNED) + no OPEN complaints
- **Tier B:** IDENTITY(EARNED) + (AUTHORITY(EARNED) OR PHOTOS(EARNED)) + no OPEN complaints
- **Tier C:** Any single EARNED dimension + no OPEN complaints
- **Tier D:** Default — no higher tier applies (including: no EARNED dimensions, or has OPEN complaints)

**Resolved constraints:**
- EXPIRED/SUSPENDED badge states are NOT EARNED for tier calculation purposes
- ranking_score computation and persistence deferred to a later sprint
- calculate(listingId) is return-only — no DB writes
- Method signature: `TrustTierResult calculate(UUID listingId)` (or similar DTO)

**AC:**
1. Tier A/B/C/D rules produce correct tier given dimension badge states
2. OPEN complaints correctly demote listing to Tier D (regardless of badges)
3. EXPIRED and SUSPENDED badges treated as not-EARNED
4. No DB writes — method is read-only
5. Unit tests cover all 4 tier paths + complaint-demotion cases
=== ROLLING CHECKPOINT END ===
