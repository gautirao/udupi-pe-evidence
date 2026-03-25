# MVP Product Specification

**Status**: Draft
**Last updated**: 2026-03-25
**Owner**: Product / Engineering

This is the authoritative MVP spec. All implementation decisions must reference this document.

---

## 1. Roles & Permissions

### 1.1 Role definitions

| Role | Description |
|------|-------------|
| `anonymous` | Unauthenticated visitor. Can see teaser discovery experience only. |
| `user` | Authenticated end-user. Can browse full listings, view insights, save areas. |
| `broker` | Property broker/agent. Can create and manage own listings. |
| `admin` | Full system access. Approves listings, manages users, runs ingestion. |

### 1.2 Permission matrix

| Action | ANONYMOUS | USER | BROKER | ADMIN |
|--------|:---------:|:----:|:------:|:-----:|
| View teaser discovery (cards, counts) | Y | Y |   Y    | Y |
| Browse full map with markers | - | Y |   Y    | Y |
| View listing detail page | - | Y |   Y    | Y |
| View insights dashboard | - | Y |   Y    | Y |
| Request viewing / book | - | Y |   Y    | Y |
| Save areas | - | Y |   Y    | Y |
| Create listing | - | - |   Y    | Y |
| Edit own listing | - | - |   Y    | Y |
| Delete own draft listing | - | - |   Y    | Y |
| Submit listing for review | - | - |   Y    | Y |
| Approve / reject listing | - | - |   -    | Y |
| View all listings (any status) | - | - |   -    | Y |
| Manage users & roles | - | - |   -    | Y |
| Run ingestion pipeline | - | - |   -    | Y |
| Access dev cleanup tools | - | - |   -    | Y |

### 1.3 Role storage

- Roles stored in `user_roles` table (existing)
- Current enum: `app_role = ('admin', 'user')`
- **MVP change**: Add `'broker'` to the `app_role` enum
- A user may have exactly one role
- Default role on signup: `user`
- Role promotion (user -> broker) is admin-only

### 1.4 Authentication

- **Primary auth**: Google Sign-In (see `docs/AUTH_STRATEGY_DECISION.md`)
- **Fallback auth**: Email + password, email OTP
- **Phone number**: Collected optionally in profile completion, not required for auth
- **SMS/WhatsApp OTP**: Post-MVP (deferred due to India DLT regulatory overhead)

### 1.5 Anonymous discovery gating

Anonymous (unauthenticated) visitors see a **teaser discovery experience** designed to demonstrate value and prompt sign-up. Login is required to unlock full property discovery.

#### 1.5.1 What anonymous users CAN see

- **Teaser property cards** in a sidebar or card grid, showing:
  - Primary photo (thumbnail)
  - Price
  - Property type (land, house, apartment, etc.)
  - City or coarse locality (e.g., "Udupi" or "Manipal")
- **Aggregate counts**: Total property count for the city, counts by property type
- **Disabled map**: A grayed-out / visually disabled map background (no interactivity)
- **Sign-up / login prompt**: Clear CTA to register for full access

#### 1.5.2 What anonymous users CANNOT see

- Exact address or pin location
- Map markers or coordinate data
- Full listing detail pages
- Seller / broker contact details
- Full property description
- Interactive map (polygon draw, search, zoom-to-pin)
- Insights dashboard
- Booking / viewing request flows
- Saved areas

#### 1.5.3 Login-gated actions

The following actions require authentication. If an anonymous user attempts them, they should be redirected to the login page and returned to the intended destination after successful auth.

| Action | Gate behaviour |
|--------|---------------|
| Open listing detail page | Redirect to login, return to `/listing/:id` after auth |
| Click map marker | Prompt login |
| Use map search / draw / filter tools | Prompt login |
| Request viewing | Redirect to login |
| Save an area | Redirect to login |
| View insights | Redirect to login |

#### 1.5.4 Public teaser data contract

The anonymous teaser endpoint returns a **redacted** listing response. This is intentional to prevent scraping of full property data by unauthenticated clients.

**Allowed teaser fields:**

| Field | Included | Notes |
|-------|:--------:|-------|
| `id` | Y | Listing identifier |
| `primaryImageUrl` | Y | First image only |
| `price` | Y | Numeric price |
| `propertyType` | Y | e.g., "house", "apartment" |
| `city` | Y | Coarse locality only |
| `listingPurpose` | Y | "sale" or "rent" |

**Explicitly excluded from teaser:**

| Field | Reason |
|-------|--------|
| `latitude` / `longitude` | Prevents pin placement on external maps |
| `locality` (exact) | Coarse city only |
| `address` / `description` | Prevents address discovery |
| `contactPhone` / `contactInfo` | Prevents direct seller contact |
| `sellerType` / `createdBy` | Prevents seller identification |
| `images` (full array) | Only primary image exposed |
| `reraNumber` | Detail-level data |
| `bedrooms` / `builtArea` / `landArea` | Detail-level data |

#### 1.5.5 Map behaviour before login

- The map area is **visually present but disabled**: grayed-out background, no tile interactivity
- **No markers** are rendered
- Polygon draw, school search, and filter tools are **not active**
- The map serves as a visual anchor showing the general region, not as a functional tool
- A prominent overlay or banner prompts the user to sign in for full map access

---

## 2. Listing Lifecycle

### 2.1 Status values

New enum: `listing_status`

| Status | Description                                                            |
|--------|------------------------------------------------------------------------|
| `DRAFT` | Created by broker, not yet submitted. Can be edited freely.            |
| `PENDING_REVIEW` | Submitted by broker. Waiting for admin approval. Locked from edits.    |
| `LIVE` | Approved by admin. Visible to all users.                               |
| `REJECTED` | Rejected by admin with reason. Broker can edit and resubmit.           |
| `SCRAPED` | Created by ingestion pipeline. Not subject to broker validation rules. |

### 2.2 Status transitions

```
Broker-created listings:

  DRAFT ──submit──> PENDING_REVIEW ──approve──> LIVE
                         │
                         └──reject───> REJECTED ──edit+resubmit──> PENDING_REVIEW

Scraped listings (ingestion pipeline):

  SCRAPED  (created by parse-posts edge function)
     │
     └──admin toggle──> LIVE   (existing is_valid behavior preserved)
```

### 2.3 Transition rules

| From | To | Actor  | Conditions |
|------|----|--------|------------|
| DRAFT | PENDING_REVIEW | Broker | All validation rules pass (see section 3) |
| PENDING_REVIEW | LIVE | Admin  | Admin approves |
| PENDING_REVIEW | REJECTED | Admin  | Admin rejects with reason (required) |
| REJECTED | PENDING_REVIEW | Broker | Broker edits and resubmits; validation rules must pass |
| DRAFT | (deleted) | Broker | Broker deletes own draft |
| SCRAPED | LIVE | Admin  | Admin manually approves (existing flow) |

### 2.4 Backward compatibility

- Existing listings created by the ingestion pipeline get status `SCRAPED`
- The `is_valid` and `confidence_score` fields are **retained** for scraped listings
- For `SCRAPED` listings, visibility continues to be governed by `is_valid = true`
- For broker-created listings, visibility is governed by `status = 'LIVE'`
- Public listing queries: `WHERE status = 'LIVE' OR (status = 'SCRAPED' AND is_valid = true)`
- **Anonymous access**: Public listing endpoints serving anonymous users return redacted teaser data only (see section 1.5.4). Full listing data requires authentication.

---

## 3. Listing Validation Rules

### 3.1 Always required (all property types, broker-created only)

| Field | Rule |
|-------|------|
| `price` | Must be > 0 |
| `property_type` | Must be one of: `land`, `house`, `apartment`, `commercial` |
| `locality` | Must be non-empty |
| Address | Must be geocoded + pin confirmed (see section 5) |
| Images | Minimum 3 uploaded images (see section 6) |

### 3.2 Required by property type (broker-created only)

| Property Type | Additional Required Fields |
|---------------|--------------------------|
| `land` | `land_area` + `land_area_unit` |
| `apartment` | `bedrooms` + `built_area` + `built_area_unit` |
| `commercial` | `total_area` + `total_area_unit` + `floors` |
| `house` | (no additional beyond always-required) |

### 3.3 Scraped listing exemptions

Scraped listings (from ingestion pipeline) are **exempt** from all broker validation rules:
- No minimum image count
- No address pin confirmation
- No required fields beyond what the AI extracts
- No property type restriction (can be `other`)

This ensures the ingestion pipeline is never blocked by MVP validation rules.

---

## 4. Notifications

### 4.1 MVP scope: in-app only

No email, SMS, or push notifications in MVP. All notifications are stored in a `notifications` table and displayed in-app.

### 4.2 Notification events

| Event | Recipient | Message |
|-------|-----------|---------|
| Listing approved (PENDING_REVIEW -> LIVE) | Broker (listing owner) | "Your listing '{title}' has been approved and is now live." |
| Listing rejected (PENDING_REVIEW -> REJECTED) | Broker (listing owner) | "Your listing '{title}' was rejected. Reason: {reason}" |
| New listing pending review | All admins | "New listing '{title}' is pending review." |

### 4.3 Notification data model

```
notifications table:
  id          UUID PK
  user_id     UUID FK -> auth.users
  type        TEXT (listing_approved, listing_rejected, review_pending)
  title       TEXT
  message     TEXT
  metadata    JSONB (listing_id, reason, etc.)
  is_read     BOOLEAN default false
  created_at  TIMESTAMPTZ
```

---

## 5. Address Validation (Geocode + Pin Confirmation)

### 5.1 Flow for broker-created listings

1. broker enters address text (locality / area name)
2. Frontend geocodes via Nominatim OSM API (same as existing `geocode-missing` logic)
3. Map shows pin at geocoded location
4. Broker can drag pin to correct position
5. Broker clicks "Confirm location"
6. Both geocoded coordinates and `address_confirmed = true` are saved

### 5.2 Data fields

| Field | Type | Description |
|-------|------|-------------|
| `latitude` | DOUBLE | Existing field |
| `longitude` | DOUBLE | Existing field |
| `address_confirmed` | BOOLEAN | New field. True = broker confirmed pin position. |

### 5.3 Rules

- Submission (DRAFT -> PENDING_REVIEW) requires `address_confirmed = true`
- Scraped listings: `address_confirmed` defaults to `false`, does not block anything
- Nominatim rate limit: 1 request/second (client-side throttle)

---

## 6. Image Upload

### 6.1 MVP scope

- Images only (no video)
- Storage: Supabase Storage
- Minimum 3 images required before listing submission
- Maximum 10 images per listing

### 6.2 Storage structure

```
Supabase Storage bucket: listing-images
Path: {user_id}/{listing_id}/{filename}
```

### 6.3 Image metadata table

```
listing_images table:
  id          UUID PK
  listing_id  UUID FK -> property_listings
  storage_path TEXT
  url         TEXT (public URL)
  position    INT (display order, 0-indexed)
  created_at  TIMESTAMPTZ
```

### 6.4 Rules

- Only listing owner (broker) or admin can upload/delete images
- Images uploaded during DRAFT or REJECTED status only
- Accepted formats: JPEG, PNG, WebP
- Max file size: 5 MB per image
- Scraped listings: images remain in `raw_posts.images` JSONB (no migration needed for MVP)

---

## 7. User Insights Dashboard

### 7.1 Available insights

#### 7.1.1 Average price by area

- **Definition**: Mean `price_per_cent_paise` grouped by `area_key`, for valid/live listings
- **Source**: `area_stats_latest` materialized view (existing) or `area_price_weekly` table
- **Display**: Bar chart or table, sorted by area
- **Filters**: Property type

#### 7.1.2 New listings in saved area (last 7 days)

- **Definition**: Count and list of listings created in the last 7 days where `area_key` matches user's saved areas
- **Source**: `property_listings WHERE created_at >= now() - interval '7 days'`
- **Default**: 7 days, configurable to 14 or 30
- **Requires**: User can save/follow areas (new: `user_saved_areas` table)

#### 7.1.3 Price trend (time series)

- **Definition**: Weekly average `price_per_cent_paise` over time, per `area_key`
- **Source**: `area_price_weekly` table (existing)
- **Display**: Line chart, x-axis = week, y-axis = avg price
- **Filters**: Area, property type, time range

#### 7.1.4 Recommended listings

- **Definition**: Deterministic heuristic, NOT ML. Score = weighted sum of:
  - Recency (created_at within last 14 days): +40 points
  - Matches user's saved areas: +30 points
  - Has images: +15 points
  - Has contact info: +15 points
- **Source**: Query with scoring, ordered by score DESC, limit 10
- **Display**: Card list with score badge

### 7.2 Supporting data model

```
user_saved_areas table:
  id          UUID PK
  user_id     UUID FK -> auth.users
  area_key    TEXT
  area_label  TEXT
  created_at  TIMESTAMPTZ

  UNIQUE(user_id, area_key)
```

---

## 8. Ingestion Pipeline Compatibility Guarantees

These guarantees are **non-negotiable**. Any PR that violates them must be reverted.

### 8.1 Preserved contracts

| Component | Contract |
|-----------|----------|
| Chrome extension | Sends posts to `{SUPABASE_URL}/functions/v1/ingest-posts` — no changes |
| `ingest-posts` edge function | Accepts array of posts, inserts into `raw_posts` — no changes |
| `parse-posts` edge function | Reads `raw_posts`, calls AI, creates `property_listings` — no changes to input/output contract |
| `geocode-missing` edge function | Fills missing lat/lon via Nominatim — no changes |
| Backend `IngestionController` | `/api/ingestion/raw-post` and `/api/ingestion/bulk` — no changes |
| `raw_posts` table schema | No column removals or renames |
| `property_listings` table schema | No column removals or renames. New columns must have defaults. |

### 8.2 Safe additions

- New columns on `property_listings` must have `DEFAULT` values (e.g., `status DEFAULT 'SCRAPED'`)
- New tables (notifications, listing_images, user_saved_areas) do not affect existing tables
- New enum values (`broker` role, `listing_status`) are additive only

### 8.3 Migration safety

- All Flyway migrations must be backward-compatible
- No `DROP COLUMN`, `DROP TABLE`, or `ALTER TYPE ... RENAME VALUE`
- Test migrations against a copy of production data before applying

---

## 9. Non-Goals (Explicit Exclusions for MVP)

| Item | Reason |
|------|--------|
| Video upload | Complexity + storage cost. Images only. |
| Google Maps API | Using OSM/Leaflet (free). No paid map services. |
| Email / SMS notifications | In-app only for MVP. Email can be Phase 2. |
| SMS / WhatsApp OTP for login | Google Sign-In + email for MVP. Phone OTP deferred (see `docs/AUTH_STRATEGY_DECISION.md`). |
| Anonymous full property access | Anonymous users see teaser only. Full access requires login (see section 1.5). |
| ML-based recommendations | Deterministic heuristic only. No model training/inference. |
| Payment / subscription | Free for MVP. Monetization is post-MVP. |
| Multi-language UI | English only. Content may be in Kannada (from scraping). |
| Mobile app | Web-only (responsive). |
| Real-time updates (WebSocket) | Polling / manual refresh for MVP. |
| Listing expiry / auto-archive | Manual management only. |
| Broker verification / KYC | Admin manually promotes users to broker role. |
| Public API | Internal use only. No third-party API access. |
| Image moderation | Manual review by admin only. |

---

## 10. New Database Fields Summary

### 10.1 Changes to existing tables

**`property_listings`** (add columns):
- `status` listing_status DEFAULT 'SCRAPED'
- `address_confirmed` BOOLEAN DEFAULT false
- `rejection_reason` TEXT
- `submitted_at` TIMESTAMPTZ
- `reviewed_at` TIMESTAMPTZ
- `reviewed_by` UUID FK -> auth.users
- `created_by` UUID FK -> auth.users (broker who created; NULL for scraped)
- `title` TEXT (explicit column; currently only in frontend interface)

**`app_role` enum**: Add `'broker'` value

### 10.2 New tables

- `listing_images` (see section 6.3)
- `notifications` (see section 4.3)
- `user_saved_areas` (see section 7.2)

### 10.3 New enum

- `listing_status`: `DRAFT`, `PENDING_REVIEW`, `LIVE`, `REJECTED`, `SCRAPED`

---

## Appendix A: Glossary

| Term | Meaning |
|------|---------|
| Scraped listing | A listing created by the Chrome extension + AI pipeline |
| Broker listing | A listing manually created by a broker through the UI |
| Pin confirmation | Broker visually confirms geocoded map pin is correct |
| area_key | Canonical area identifier: `country\|region\|city\|locality` |
| price_paise | Price in 1/100 of a rupee (canonical price field) |
| cent | Land area unit: 1 cent = 435.6 sq ft |
