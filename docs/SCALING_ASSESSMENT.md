# Scaling & Microservice Readiness Assessment

**Date**: 2026-03-16
**Author**: Architecture review (automated)
**Codebase snapshot**: commit `b6ebc0e` (main)
**Stage**: MVP / early-stage (single team, low hundreds of users, single Postgres DB)

---

## Executive Summary

The backend is a 13,000-line Spring Boot monolith organized into 16 top-level packages. Overall package hygiene is reasonable for an MVP -- most packages have clear single responsibilities and communicate through well-defined Spring events. However, the **`listing` package is a clear hotspot**: it contains 28 files (11,500 lines), hosts business logic for six distinct concerns (CRUD, admin review, images, duplicates, locality normalization, and storage), and is depended upon by 8 of the other 15 packages.

**Key finding**: The codebase is NOT ready for microservice extraction, nor does it need to be. Current scale does not justify it. What it DOES need is **internal modular cleanup within the monolith** -- specifically, extracting shared concerns (auth/role resolution, notification insertion) out of packages where they do not belong, and splitting the `listing` god-package into coherent sub-domains. These are prerequisite refactors that (a) reduce coupling today and (b) create clean seam lines for future extraction IF scale ever demands it.

**Recommended posture**: Stay as a monolith. Refactor internal boundaries. Do not introduce any new infrastructure components.

---

## Current Architecture Overview

### Backend packages (16)

| Package | Files | Lines | Role |
|---------|-------|-------|------|
| `listing` | 28 | 11,502 | Listing CRUD, admin review, images, duplicates, locality, storage |
| `poi` | 11 | 2,530 | Points of interest (Overpass integration, management) |
| `booking` | 6 | 2,190 (inc. events) | Viewing request lifecycle |
| `geo` | 6 | 1,374 | Geocoding (Nominatim proxy + cache) |
| `insights` | 6 | 1,246 | Saved areas, recommendations, price insights |
| `dashboard` | 4 | 1,250 | Public dashboard queries (price history, search, map) |
| `ingestion` | 9 | 1,180 | Raw post ingestion + AI classification pipeline |
| `ai` | 7 | 990 | AI classification client + prompts |
| `analytics` | 3 | 994 | Scheduled rollup jobs (area stats) |
| `notification` | 5 | 958 | Notification entities + event listeners |
| `security` | 3 | 424 | JWT config, API key filter, MDC filter |
| `config` | 3 | 284 | CORS, app config, Sentry test |
| `exception` | 2 | 276 | Global exception handler, rate limiter |
| `broker` | 1 | 258 | Broker (dealer) setup controller |
| `dealer` | 1 | 244 | Dealer setup controller (legacy) |
| `payment` | 1 | 224 | Payment controller (stub) |

### Frontend structure

- 37 pages across 4 route groups: public (Index, ListingDetail), broker (6 pages), admin (10 pages), user (MyBookings, SavedAreas, Insights)
- 18 hooks, domain-aligned (useBookings, useBrokerListings, useInsights, etc.)
- Components organized by domain (broker/, dealer/, listing/, map/, poi/, insights/, admin/, notifications/) + shared `ui/` (shadcn)
- Lazy-loaded route groups (admin, broker, insights)

### Infrastructure

- Single CI pipeline (`.github/workflows/ci.yml`) -- frontend job + backend job, no per-service separation
- Single Flyway migration chain: V0 through V40 (41 migrations, one `property_listings` table as the core)
- Single Postgres database via Supabase
- No message broker, no cache layer, no search index beyond Postgres `tsvector`

---

## Domain Package Analysis

### 1. `listing` -- COUPLING HOTSPOT

**28 files, 11,502 lines** -- largest package by 5x.

**Internal sub-concerns (at least 6 distinct responsibilities):**
1. **Core CRUD**: `ListingController`, `ListingService`, `ListingRepository`, `Listing`, `ListingStatus` (dealer/owner listing management)
2. **Admin review**: `AdminListingController`, `AdminAuditController`, `AdminAuditService`, `AdminLocalityController`, `LocalityNormalizerService`
3. **Admin duplicates**: `AdminDuplicateController`, `DuplicateCandidateService`, `DuplicateCandidate`, `DuplicateCandidateRepository`, `DuplicateCandidateStatus`, `ProximityDuplicateService`, `ProximityDuplicateBatchJob`
4. **Images**: `ListingImageController`, `ListingImageRegistrar`, `ListingImage`, `ListingImageRepository`
5. **Public read**: `PublicListingController`
6. **Infrastructure**: `SupabaseStorageService`, `AreaNormalizer`, `AreaUnitConverter`, `PriceParser`, `PriceChangeLog`, `PriceChangeLogRepository`

**Cross-domain imports FROM listing:**
- `ai` (ClassificationResult, PromptRegistry, PropertyType)
- `geo` (GeocodingPort, GeocodingService)
- `ingestion` (RawPost, RawPostRepository)
- `poi` (PoiQueryProfile)

**Cross-domain imports INTO listing (8 packages depend on it):**
- `booking` -> Listing, ListingRepository, ListingStatus
- `dashboard` -> Listing, ListingRepository, ListingRepository.OpportunityProjection
- `ingestion` -> Listing, ListingService
- `insights` -> Listing, ListingRepository, ListingRepository.OpportunityProjection
- `notification` -> ListingRepository, ListingService events (ListingApprovedEvent, ListingRejectedEvent, NewListingInAreaEvent)
- `poi` -> Listing, ListingRepository, ListingService
- `geo` -> ListingService (AdminGeocodingController)

**God class: `ListingService.java`** -- 1,201 lines, 20+ public methods spanning:
- Ingestion-path creation (`createFrom`)
- Dealer draft creation (4 overloaded `createDraft` methods)
- Update (4 overloaded `updateListing` methods)
- Delete, bulk delete
- Submit, approve, reject, restore, force-archive
- User role lookup (`getUserRole`) -- does NOT belong here
- Listing stats

**God entity: `Listing.java`** -- 881 lines, 50+ columns, mixing:
- Core property data (type, price, area, location)
- Ingestion metadata (rawPostId, confidenceScore, dedupeHash, parsedData)
- Dealer workflow state (status, submittedAt, reviewedAt, rejectionReason)
- Commercial/rental extensions (carpetArea, floorNumber, monthlyRent, etc.)
- Transparency/audit (firstPublishedAt, lastLiveAt, backToMarketAt)
- Soft delete (archivedAt)
- RERA compliance (reraNumber, possessionStatus, approvalsDeclared)

**Coupling score: CRITICAL (8 inbound dependents, 4 outbound dependencies)**

### 2. `booking` -- MOSTLY CLEAN

**6 files, 2,190 lines**

Imports from other domains:
- `listing.Listing` -- to verify listing exists and is LIVE
- `listing.ListingRepository` -- to look up listing, user role, and INSERT notifications
- `listing.ListingStatus` -- status enum check
- `notification.EmailService` -- email dispatch from BookingEventListener

The `BookingService` is well-contained. Its coupling to `listing` is through the `ListingRepository` for two reasons:
1. **Legitimate**: checking listing status and owner for booking creation
2. **Illegitimate**: `ListingRepository.insertNotification()` -- notification insertion queries live in the WRONG repository; `ListingRepository.findUserRole()` -- role lookup lives in the WRONG repository

**Coupling score: MODERATE (2 inbound issues to fix, core logic clean)**

### 3. `ingestion` -- CLEAN PIPELINE

**9 files, 1,180 lines**

Imports from:
- `ai` (ClassificationService, ClassificationResult, ClassificationException)
- `listing` (Listing, ListingService)

This is a well-structured ETL pipeline: `IngestionController` -> `RawPostService` -> `IngestionJobRunner` -> `ClassificationService` -> `ListingService.createFrom()`. The pipeline sub-package (`pipeline/`) contains step abstractions.

The coupling to `listing` is through `ListingService.createFrom()` -- the pipeline's output IS a listing, so this dependency is inherent and correct.

**Coupling score: LOW (dependencies are inherent, not accidental)**

### 4. `insights` -- READS-HEAVY, COUPLED TO LISTING + DASHBOARD

**6 files, 1,246 lines**

Imports from:
- `listing` (Listing, ListingRepository, OpportunityProjection)
- `dashboard` (AreaInsightsDao, AreaPriceWeekly, AreaPriceWeeklyRepository)

This package is a read-only aggregation layer over listing and analytics data. All its queries go through `ListingRepository` and `AreaPriceWeeklyRepository`. The cross-package imports are read-only data access -- they would be replaced by API calls in a service split, but that is premature.

**Coupling score: MODERATE (read-only coupling, acceptable for now)**

### 5. `poi` -- CLEAN, LISTING-ADJACENT

**11 files, 2,530 lines**

Imports from:
- `listing` (Listing, ListingRepository, ListingService)

POIs are inherently listing-scoped. The `ListingPoiController` needs to verify listing ownership (hence `ListingRepository.findById()` and `ListingService.getUserRole()`). This is a natural satellite of the listing domain.

**Coupling score: LOW (inherent relationship)**

### 6. `notification` -- LISTENER PATTERN, WELL-ISOLATED

**5 files, 958 lines**

Imports from:
- `listing` (ListingRepository, ListingService events)
- `insights` (SavedArea, SavedAreaRepository)

`NotificationEventListener` subscribes to domain events and inserts notifications. The architecture is sound -- `@TransactionalEventListener(AFTER_COMMIT)` with `@Async` ensures notification failures do not affect core transactions. However, notification INSERTION uses `ListingRepository.insertNotification()` rather than its own repository -- a misplacement.

**Coupling score: LOW (event-driven, correct pattern)**

### 7. `dashboard` -- READ-ONLY, LISTING-DEPENDENT

**4 files, 1,250 lines**

Imports from:
- `listing` (Listing, ListingRepository, OpportunityProjection)

Pure read API. `DashboardController` has its own DTOs (`MapListingResponse`, `SearchListingResponse`) distinct from `ListingController.ListingResponse`. This is good -- different API shapes for different consumers.

**Coupling score: LOW (read-only coupling)**

### 8. `geo` -- MOSTLY INDEPENDENT

**6 files, 1,374 lines**

One outbound dependency: `AdminGeocodingController` imports `ListingService` for `getUserRole()` (role check). The core `GeocodingService` has ZERO cross-domain imports -- it is a clean infrastructure service.

**Coupling score: MINIMAL (one misplaced auth dependency)**

### 9. `ai` -- CLEAN INFRASTRUCTURE

**7 files, 990 lines**

Single outbound dependency: `ClassificationService` imports `ingestion.RawPost` (input type). No inbound dependencies from outside the ingestion pipeline.

**Coupling score: MINIMAL**

### 10. `analytics` -- ISOLATED

**3 files, 994 lines**

Zero cross-domain imports. Self-contained scheduled jobs that read/write rollup tables.

**Coupling score: NONE**

### 11. `security` -- SHARED KERNEL (correct)

**3 files, 424 lines**

Zero cross-domain imports. Provides JWT config and API key filter. Consumed indirectly by all authenticated endpoints via Spring Security filter chain.

**Coupling score: NONE (shared infrastructure, correct placement)**

### 12. `config`, `exception`, `broker`, `dealer`, `payment` -- LEAF PACKAGES

All are either infrastructure (`config`, `exception`) or thin controller stubs (`broker`, `dealer`, `payment`) with zero or minimal cross-domain coupling.

---

## Dependency Graph

```
                  +-----------+
                  | security  |  (shared kernel, imported by Spring Security chain)
                  +-----------+

    +----------+      +----------+      +----------+
    | ingestion| ---> |    ai    |      | analytics|  (isolated)
    +----------+      +----------+      +----------+
         |
         v
  +==============+
  ||  listing   ||  <--- 8 packages depend on this
  || (28 files) ||
  +==============+
    ^   ^   ^  ^
    |   |   |  |
    |   |   |  +--- poi (listing ownership check)
    |   |   +------ booking (listing lookup + status check)
    |   +---------- dashboard (read-only queries)
    +-------------- insights (read-only queries + dashboard data)
         |
         v
  +--------------+
  | notification |  (event listener)
  +--------------+
         |
         v
  +--------------+
  |    geo       |  (geocoding, AdminGeocodingController uses ListingService.getUserRole)
  +--------------+
```

**Note**: Arrows show data/import flow, not event flow. Event flow (via `ApplicationEventPublisher`) goes: `listing` -> `notification`, `listing` -> `poi` (SettlementEnrichmentRequestedEvent), `booking` -> `booking`/`notification`.

---

## Top 5 Coupling Hotspots

### 1. `ListingRepository.findUserRole()` -- role lookup in wrong repository

**File**: `listing/ListingRepository.java:83-85`
**Impact**: Called from 7 controllers across 5 packages (listing, booking, geo, poi, notification)
**Problem**: User role lookup is an **auth/identity concern**, not a listing concern. It lives in `ListingRepository` because that was the first place it was needed, and every subsequent consumer imported `ListingRepository` or `ListingService.getUserRole()` to access it.
**Severity**: HIGH -- this is the single largest source of accidental coupling. Every package that needs to check user roles becomes dependent on `listing`.

### 2. `ListingRepository.insertNotification()` -- notification write in wrong repository

**File**: `listing/ListingRepository.java:73-81`
**Impact**: Called from `NotificationEventListener` and `BookingEventListener` (both go through `ListingRepository` to insert notifications)
**Problem**: A native INSERT into `notifications` table lives on `ListingRepository`. This forces `notification` and `booking` to depend on `ListingRepository` for something that has nothing to do with listings.
**Severity**: HIGH -- creates false coupling between notification/booking and listing.

### 3. `ListingService.java` -- god service (1,201 lines, 20+ public methods)

**File**: `listing/ListingService.java`
**Impact**: Imported by `ingestion`, `poi`, `geo`, `notification` (via events)
**Problem**: Mixes ingestion-path creation, dealer CRUD, admin review workflow, user role lookup, and event publishing. Any change to any of these concerns risks merge conflicts or unintended side effects across domains.
**Severity**: HIGH -- primary bottleneck for parallel development.

### 4. `ListingController.ListingResponse` -- shared DTO used across controllers

**Files**: `listing/ListingController.java:370-422`, `listing/AdminListingController.java:148-192`, `listing/PublicListingController.java:91-115`
**Impact**: Three controllers duplicate the `toResponse(Listing)` mapping with identical logic (40+ fields). `AdminListingController` and `PublicListingController` reference `ListingController.ListingResponse` directly.
**Problem**: (a) Duplication -- three copies of the mapping logic. (b) Tight coupling -- changing the response shape requires updating 3 places. (c) The `toResponse` method queries `ListingImageRepository` per listing (N+1 potential).
**Severity**: MEDIUM -- maintenance burden, but no correctness risk.

### 5. Duplicated `resolveCallerOrForbid` / `CallerInfo` pattern

**Files**: 8 controllers each define their own private `resolveCallerOrForbid()` method and `CallerInfo` record
**Impact**: `ListingController`, `ListingImageController`, `ListingPoiController`, `BookingController`, `AdminListingController`, `AdminDuplicateController`, `AdminLocalityController`, `AdminGeocodingController`
**Problem**: Every controller independently resolves the JWT subject, looks up the user role from `ListingRepository.findUserRole()`, and creates a local `CallerInfo` record. The role lookup routes through `ListingService.getUserRole()` or `BookingService.getUserRole()` -- both of which delegate to the same `ListingRepository.findUserRole()` query.
**Severity**: MEDIUM -- duplication and unnecessary transitive dependencies.

---

## Natural Service Boundaries

Based on the coupling analysis, these are the packages that are already clean modules with minimal cross-domain imports:

### Clean modules (ready to extract IF needed)

| Package | Inbound deps | Outbound deps | Verdict |
|---------|-------------|---------------|---------|
| `analytics` | 0 | 0 | **Fully isolated** -- could be a separate cron job today |
| `geo` | 1 (listing, admin auth) | 0 | **Clean** -- one misplaced auth dep to fix |
| `ai` | 1 (ingestion) | 1 (ingestion.RawPost) | **Clean** -- input/output types only |
| `security` | 0 (shared kernel) | 0 | **Shared kernel** -- stays in every service |
| `config` | 0 | 0 | **Shared infrastructure** -- stays in every service |

### Partially entangled (need cleanup before extraction)

| Package | Blocking coupling | Fix needed |
|---------|------------------|------------|
| `booking` | `ListingRepository.findUserRole`, `ListingRepository.insertNotification` | Move role lookup to shared service; move notification insert to NotificationRepository |
| `notification` | `ListingRepository.insertNotification`, `ListingService` events | Move notification insert; events are fine (use event types, not service reference) |
| `poi` | `ListingService.getUserRole`, `ListingRepository` | Move role lookup to shared service |
| `ingestion` | `ListingService.createFrom` | Inherent -- ingestion creates listings |

### Deeply entangled (need significant internal restructuring)

| Package | Problem |
|---------|---------|
| `listing` | Contains auth, notification, admin, image, duplicate, and core CRUD concerns in one package |
| `insights` + `dashboard` | Both read from `ListingRepository` and `AreaPriceWeeklyRepository` -- need read models or API boundaries |

---

## Decomposition Sequence (Recommended)

**Critical context**: This is an MVP with a single development team. No decomposition into separate services is recommended at this stage. The goal of this sequence is **modular monolith cleanup** -- improving internal boundaries so that future extraction (if ever needed) becomes a mechanical exercise rather than a risky rewrite.

### Phase 0: Prerequisite Refactoring (MUST DO FIRST)

These refactors reduce coupling, eliminate duplication, and establish clean seam lines. They are independently valuable regardless of whether microservice extraction ever happens.

**Estimated total effort: 2-3 sprints (6-10 PRs)**

#### 0a. Extract UserRoleService (shared kernel)

Move `findUserRole()` out of `ListingRepository` into a new shared service:

- New: `security/UserRoleService.java` (or `auth/UserRoleService.java`)
- New: `security/UserRoleRepository.java` (JPA repository for `user_roles` table)
- Remove: `ListingRepository.findUserRole()`
- Remove: `ListingService.getUserRole()` and `BookingService.getUserRole()`
- Update: all 8 controllers that call `getUserRole()` or `findUserRole()` to inject `UserRoleService`

This single change eliminates the largest source of accidental coupling.

#### 0b. Extract NotificationRepository for writes

Move `ListingRepository.insertNotification()` to `NotificationRepository`:

- Add: `insertNotification()` to existing `notification/NotificationRepository.java`
- Remove: `ListingRepository.insertNotification()`
- Update: `NotificationEventListener`, `BookingEventListener` to use `NotificationRepository` directly

#### 0c. Extract shared CallerInfo + auth resolution

Create a shared utility or Spring `HandlerMethodArgumentResolver`:

- New: `security/CallerInfo.java` (shared record)
- New: `security/CallerInfoResolver.java` (resolves JWT -> userId -> role -> CallerInfo)
- Remove: 8 private `resolveCallerOrForbid()` methods and 8 private `CallerInfo` records across controllers

#### 0d. Extract ListingResponseMapper

Create a shared mapper to eliminate the 3 duplicated `toResponse(Listing)` methods:

- New: `listing/ListingResponseMapper.java` (Spring component)
- Consolidate: `ListingController.toResponse()`, `AdminListingController.toResponse()`, `PublicListingController.toResponse()`
- Inject: `ListingImageRepository` into the mapper (currently each controller injects it separately)

### Phase 1: Split `listing` package internally

After Phase 0 prerequisites are done, split the 28-file `listing` package into sub-packages:

```
listing/
  core/        -- Listing.java, ListingRepository, ListingService (trimmed), ListingStatus
  admin/       -- AdminListingController, AdminAuditController, AdminAuditService,
                  AdminLocalityController, LocalityNormalizerService
  duplicate/   -- AdminDuplicateController, DuplicateCandidate*, ProximityDuplicate*
  image/       -- ListingImageController, ListingImageRegistrar, ListingImage, ListingImageRepository
  publicapi/   -- PublicListingController
  support/     -- AreaNormalizer, AreaUnitConverter, PriceParser, PriceChangeLog*,
                  SupabaseStorageService
```

This is a package-level reorganization within the monolith. No service split.

#### Split ListingService.java

The 1,201-line service should be split into:

- `ListingCrudService` -- createDraft, updateListing, deleteListing, bulkDeleteListings, getListingsByOwner, getListingStats
- `ListingWorkflowService` -- submitListing, approveListing, rejectListing, restoreListing, adminForceDelete (admin review lifecycle)
- `ListingIngestionService` -- createFrom (ingestion-path creation, called by IngestionJobRunner)

Each of these has a clear single responsibility and a distinct set of callers.

### Phase 2: Event contract formalization (optional, if team grows)

If the team grows beyond 2-3 backend engineers working in parallel:

- Define domain events as first-class types in a `listing/event/` package
- Move event records out of `ListingService` into standalone files
- This reduces the import surface -- consumers import event types, not the service itself

### Phase 3: Service extraction (NOT RECOMMENDED NOW)

If and when scale demands it (see below), the extraction order would be:

1. **Ingestion + AI** -- already isolated, different scaling profile (batch), different failure mode (AI unavailability)
2. **Booking** -- clean domain boundary, separate read/write patterns, separate user types (requester vs dealer)
3. **Insights + Analytics** -- read-heavy, could be a read replica consumer
4. **POI** -- external API dependency (Overpass), different caching needs

**Trigger conditions for extraction**:
- Ingestion: if AI call volume exceeds what a single @Scheduled poller can handle (currently batch of N every poll interval -- sufficient for thousands of posts/day)
- Booking: if booking request rate creates contention with listing writes (currently negligible)
- Insights: if analytics queries slow down the main database (add read replica first)

---

## Strangle-Fig vs Big-Bang Analysis

| Approach | Applicable? | Assessment |
|----------|-------------|------------|
| Big-bang rewrite | NO | The monolith is 13K lines with good test coverage. A rewrite would be unjustified architecture astronautics. |
| Big-bang package split | NO | Moving 28 files into sub-packages in one PR is risky and review-hostile. |
| Strangle-fig (incremental) | YES -- recommended | Each prerequisite refactor (0a-0d) is a small, independently valuable PR. Phase 1 sub-packages can be done one at a time. |

**Recommended approach**: One PR per refactor step. Each PR is backward-compatible (no API changes). Each PR reduces coupling measurably. If priorities shift, the work done so far is still valuable.

---

## Infrastructure Gaps

### What is NOT needed

| Tool | Status | Why not needed |
|------|--------|---------------|
| Message broker (Kafka/RabbitMQ) | Not needed | Event volume is low (tens of events/day). Spring `ApplicationEventPublisher` with `@Async` listeners is sufficient. |
| Redis cache | Not needed | Geocode cache is in Postgres (correct for this scale). Rate limiting uses in-memory Bucket4j (correct for single-instance). |
| Elasticsearch | Not needed | Postgres `tsvector` with `websearch_to_tsquery` handles current search needs. |
| API gateway | Not needed | Single backend service. CORS and routing handled by Spring Security. |
| Service mesh | Not needed | No services to mesh. |
| Container orchestration (K8s) | Not needed | Single service deployment (Render or equivalent). |

### What IS needed (for monolith health, not for splitting)

| Gap | Priority | Rationale |
|-----|----------|-----------|
| **Structured integration tests for cross-domain flows** | HIGH | The booking-creates-notification flow, ingestion-creates-listing flow, and approval-triggers-alert flow are tested only via E2E. A failing E2E test has a large blast radius. Domain-level integration tests (Spring `@SpringBootTest` slices) would catch regressions faster. |
| **Database connection pooling visibility** | MEDIUM | With insights, dashboard, booking, and listing all hitting the same Postgres, connection pool exhaustion is the most likely scaling bottleneck. Add HikariCP metrics to Actuator. |
| **Read replica readiness** | LOW (future) | If read-heavy dashboard/insights queries start affecting write latency, adding a read replica with Spring's `AbstractRoutingDataSource` would be the first scaling step. No action needed now. |

---

## Prerequisite Refactoring (must-do before any split)

These are ordered by impact per effort:

| # | Refactor | Files touched | Effort | Impact |
|---|----------|--------------|--------|--------|
| 1 | Extract `UserRoleService` from `ListingRepository.findUserRole()` | ~12 files across 6 packages | M (3-5d) | Eliminates #1 coupling hotspot; 8 controllers decoupled from `listing` |
| 2 | Move `insertNotification()` from `ListingRepository` to `NotificationRepository` | ~4 files across 3 packages | S (1-2d) | Eliminates #2 coupling hotspot |
| 3 | Shared `CallerInfo` + auth resolver | ~10 files across 5 packages | M (3-5d) | Eliminates 8 duplicate auth patterns |
| 4 | Extract `ListingResponseMapper` | ~4 files in `listing` | S (1-2d) | Eliminates 3 duplicate 40-field mapping methods |
| 5 | Split `ListingService` into Crud/Workflow/Ingestion | ~6 files in `listing` | M (3-5d) | Reduces god class from 1201 lines to ~400 each |
| 6 | Sub-package `listing` into core/admin/duplicate/image/support | ~28 files, package moves only | M (3-5d) | Logical clarity, import hygiene |

**Total: ~6 PRs, ~3-4 weeks of focused work**

---

## Effort Estimates

| Phase | Scope | Effort | Risk |
|-------|-------|--------|------|
| Phase 0a: UserRoleService | New service + update 12 callers | 3-5 days | Low -- mechanical refactor, good test coverage |
| Phase 0b: NotificationRepository | Move 1 query + update 2 listeners | 1-2 days | Low |
| Phase 0c: Shared CallerInfo | New resolver + update 8 controllers | 3-5 days | Low-Med -- touches many controllers, need careful testing |
| Phase 0d: ListingResponseMapper | Extract mapper + update 3 controllers | 1-2 days | Low |
| Phase 1a: Split ListingService | 3 new services from 1 | 3-5 days | Medium -- behavioral risk in transaction boundaries |
| Phase 1b: Sub-package listing | Package reorganization | 3-5 days | Low -- IDE refactor + import updates |

---

## Frontend Assessment

The frontend is well-organized and does NOT have significant coupling problems:

- **Hooks are domain-aligned**: `useBookings.ts`, `useBrokerListings.ts`, `useInsights.ts`, etc. Each hook talks to its own API endpoints.
- **Components are domain-scoped**: `components/broker/`, `components/listing/`, `components/poi/`, etc.
- **Lazy loading by route group**: admin pages, broker pages, and insights are code-split correctly.
- **No circular imports observed**: pages import from hooks and components; hooks import from lib; components import from ui.
- **One concern**: `components/dealer/` and `components/broker/` contain duplicate files (AddressPicker, AreaField, ImageUploader, PriceField, StepIndicator). These should be consolidated into `components/broker/` only, with the `dealer/` copies removed, since the dealer-to-broker rename is in progress.

The frontend would require minimal changes in a backend service split -- API base URLs would change but the hook structure is already domain-isolated.

---

## Recommended Linear Issues

### 1. Extract UserRoleService from ListingRepository

- **Title**: `refactor: extract UserRoleService to eliminate listing-package coupling`
- **Scope**: New `security/UserRoleService.java`, `security/UserRoleRepository.java`; update `ListingRepository`, `ListingService`, `BookingService`, `ListingController`, `ListingImageController`, `AdminListingController`, `AdminDuplicateController`, `AdminLocalityController`, `AdminAuditController`, `BookingController`, `AdminGeocodingController`, `ListingPoiController`
- **Why it unblocks service split**: This is the single largest source of accidental coupling -- 8 controllers across 5 packages depend on `listing` solely because role lookup lives there. Extracting it removes the false dependency and makes every domain package independently testable.
- **Priority**: High
- **Estimated effort**: M (3-5d)

### 2. Move insertNotification() to NotificationRepository

- **Title**: `refactor: move insertNotification from ListingRepository to NotificationRepository`
- **Scope**: `listing/ListingRepository.java`, `notification/NotificationRepository.java`, `notification/NotificationEventListener.java`, `booking/BookingEventListener.java`
- **Why it unblocks service split**: Notification and booking packages currently depend on `ListingRepository` for a query that has nothing to do with listings. Moving it eliminates a false cross-domain dependency.
- **Priority**: High
- **Estimated effort**: S (1-2d)

### 3. Consolidate CallerInfo and auth resolution

- **Title**: `refactor: shared CallerInfo resolver to eliminate 8 duplicate auth patterns`
- **Scope**: New `security/CallerInfo.java`, `security/CallerInfoResolver.java`; update 8 controllers
- **Why it unblocks service split**: Each controller currently has its own private auth resolution that routes through `ListingService.getUserRole()`. A shared resolver decouples all controllers from `ListingService` for auth purposes. Also reduces ~200 lines of duplicated code.
- **Priority**: Medium
- **Estimated effort**: M (3-5d)

### 4. Extract ListingResponseMapper

- **Title**: `refactor: extract ListingResponseMapper to eliminate 3 duplicate toResponse methods`
- **Scope**: New `listing/ListingResponseMapper.java`; update `ListingController`, `AdminListingController`, `PublicListingController`
- **Why it unblocks service split**: The 40+-field `toResponse()` method is duplicated in 3 controllers. A single mapper reduces maintenance surface and ensures response shape consistency. Also centralizes the N+1 `ListingImageRepository.countByListingId` call for future optimization.
- **Priority**: Medium
- **Estimated effort**: S (1-2d)

### 5. Split ListingService into Crud, Workflow, and Ingestion services

- **Title**: `refactor: split ListingService (1201 lines) into ListingCrudService, ListingWorkflowService, ListingIngestionService`
- **Scope**: `listing/ListingService.java` -> 3 new files; update `ListingController`, `AdminListingController`, `IngestionJobRunner`
- **Why it unblocks service split**: The god service is the primary merge-conflict hotspot and the hardest thing to reason about during a split. Three focused services with single responsibilities can be extracted independently.
- **Priority**: Medium
- **Estimated effort**: M (3-5d)

### 6. Sub-package the listing directory

- **Title**: `refactor: organize listing/ into core, admin, duplicate, image, publicapi, support sub-packages`
- **Scope**: 28 files in `listing/` -> 6 sub-packages (package-level moves, no logic changes)
- **Why it unblocks service split**: A flat package with 28 files obscures which files form a cohesive unit. Sub-packages make the natural service boundaries visible to any engineer. Also enforces that sub-domains access each other through public interfaces rather than package-private shortcuts.
- **Priority**: Low
- **Estimated effort**: M (3-5d)

### 7. Consolidate broker/dealer component duplicates in frontend

- **Title**: `refactor: remove duplicate dealer/ components, consolidate into broker/`
- **Scope**: `src/components/dealer/AddressPicker.tsx`, `src/components/dealer/AreaField.tsx`, `src/components/dealer/ImageUploader.tsx`, `src/components/dealer/PriceField.tsx`, `src/components/dealer/StepIndicator.tsx`; update imports in `src/pages/dealer/`
- **Why it unblocks service split**: N/A for backend, but reduces frontend maintenance burden. The dealer-to-broker rename is in progress; these duplicate components are tech debt from that transition.
- **Priority**: Low
- **Estimated effort**: S (1-2d)

### 8. Add HikariCP connection pool metrics to Actuator

- **Title**: `chore: expose HikariCP metrics via Actuator for connection pool monitoring`
- **Scope**: `application.yml` or `application.properties` configuration only
- **Why it unblocks service split**: Connection pool exhaustion is the most likely scaling bottleneck at current architecture. Visibility into active/idle/pending connections is prerequisite for informed scaling decisions. Without metrics, you would not know whether to add a read replica, increase pool size, or optimize queries.
- **Priority**: Low
- **Estimated effort**: S (1-2d)

---

## Appendix: Scale Context

**Current load (estimated):**
- Users: low hundreds (MVP stage)
- Listings: hundreds to low thousands in database
- Requests/day: likely under 10,000
- Concurrent users: likely under 50
- Ingestion: batch processing, tens to hundreds of posts per day
- Bookings: single-digit per day

**Near-term growth (6-12 months):**
- Users: could grow to low thousands
- Listings: could grow to tens of thousands
- Requests/day: could reach 50,000-100,000

**Bottleneck analysis:**
- At current load: no bottleneck. Single Postgres + single Spring Boot instance is sufficient.
- At 10x load: Postgres becomes the bottleneck for read-heavy dashboard/insights queries. Mitigation: read replica (not microservices).
- At 100x load: possibly separate ingestion scaling (but @Scheduled batch is surprisingly resilient). Mitigation: increase batch size and parallelism within the monolith.

**Conclusion**: Microservice extraction is not justified at current or projected 12-month scale. Internal modular cleanup is the correct investment: it reduces daily development friction, improves testability, and creates clean seam lines for future extraction if scale ever demands it.
