# CLAUDE README

## Purpose of this document

This README is **the single source of truth** for Claude (or any AI agent) working on this codebase.

The goal is to migrate **all ingestion, processing, and business logic** from Supabase Edge Functions into a **Java (Spring Boot) backend**, while **intentionally keeping Supabase as infrastructure** (Auth, Postgres, Storage).

Claude must **follow this document strictly**. Any deviation should be considered a bug.

---

## Non‑goals (DO NOT DO THESE)

Claude must **never**:

* Re‑implement authentication (passwords, OAuth, sessions)
* Re‑implement Google / Facebook login
* Store user credentials
* Create a Java Supabase “SDK” abstraction
* Move business logic back into Edge Functions
* Use Supabase client libraries for Java (they do not exist and are not desired)
* Put AI calls on synchronous user request paths
* Query raw scraped data directly for dashboards

Supabase is **not** an application framework. It is **managed infrastructure**.

---

## High‑level architecture (MANDATORY)

```
Chrome Extension (Facebook scraping)
        ↓  (Supabase JWT)
Java Spring Boot Backend
        ↓
Supabase Postgres
```

Supabase responsibilities:

* Authentication (email, Google, Facebook, magic links)
* JWT issuance
* Managed Postgres
* Optional object storage

Java backend responsibilities:

* Ingestion API
* Data normalization
* AI classification
* Geocoding
* Deduplication orchestration
* Trend aggregation
* All business rules

---

## Authentication model (CRITICAL)

### Source of truth

* Supabase Auth is the **only** identity provider
* Supabase issues standard JWTs
* Java backend is a **resource server**, not an auth server

### Flow

1. User signs in via Supabase (frontend or Chrome extension)
2. Supabase issues JWT
3. Client sends:

   ```
   Authorization: Bearer <supabase-jwt>
   ```
4. Java backend validates JWT using Supabase JWKS

### Java configuration (reference)

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://<project-ref>.supabase.co/auth/v1
```

Claude must **not** add:

* Password handling
* OAuth flows
* Token refresh logic

All providers (email, Google, Facebook) work automatically via JWT validation.

---

## Ingestion philosophy

Ingestion is **append‑only, asynchronous, and idempotent**.

### NEVER

* Block ingestion on AI calls
* Block ingestion on deduplication
* Mix raw data with cleaned listings

### ALWAYS

* Persist raw data first
* Process via background jobs
* Track processing state explicitly

---

## Data model (MANDATORY separation)

### Raw data (immutable)

```sql
raw_posts (
  id,
  source,
  source_post_id,
  raw_text,
  raw_images,
  author,
  received_at,
  user_id
)
```

Raw data is:

* Never updated
* Never deleted
* Never queried by dashboards

### Listings (clean domain)

```sql
listings (
  id,
  title,
  description,
  price,
  area_sqm,
  latitude,
  longitude,
  category,
  confidence,
  created_at
)
```

---

## Ingestion API contract (STRICT)

### Endpoint

```
POST /api/ingestion/raw-post
```

### Input

```json
{
  "source": "FACEBOOK",
  "sourcePostId": "fb_123",
  "rawText": "...",
  "images": ["https://..."],
  "author": "...",
  "postedAt": "2025-01-10T12:00:00Z"
}
```

### Behaviour

* Validate JWT
* Persist raw post
* Enqueue ingestion job
* Return **202 Accepted**

NO processing is done synchronously.

---

## Ingestion pipeline (BACKGROUND JOB)

Claude must implement the pipeline as **composable steps**:

1. Text normalization
2. Title & description extraction
3. Image normalization
4. Location extraction
5. Geocoding
6. AI classification (real estate or not)
7. Listing assembly
8. Persistence

Each step must be:

* Idempotent
* Retryable
* Logged

Failures must NOT lose raw data.

---

## AI usage rules (VERY IMPORTANT)

AI is used **only for classification**, never scraping.

### Input

* Title
* Description
* Price hints
* Location hints

### Output (JSON ONLY)

```json
{
  "is_real_estate": true,
  "category": "RESIDENTIAL_RENT",
  "confidence": 0.91
}
```

Claude must:

* Enforce strict JSON schema
* Store AI decisions
* Version prompts
* Apply confidence thresholds

---

## Deduplication rules

Deduplication is **post‑ingestion**.

* Do NOT block ingestion
* Do NOT delete raw posts
* Use hashes + similarity later

Initial implementation:

* Hash(normalized_title + location + price)

---

## Java project structure (REQUIRED)

```
com.example.realestate
 ├── ingestion
 │   ├── IngestionController
 │   ├── RawPostService
 │   ├── IngestionJobRunner
 │   └── pipeline
 ├── listing
 │   ├── ListingService
 │   └── ListingRepository
 ├── ai
 │   └── ClassificationService
 ├── geo
 │   └── GeocodingService
 ├── security
 │   └── JwtConfig
 └── config
```

Claude must not collapse layers.

---

## Supabase usage rules

### Allowed

* JDBC access to Postgres
* Supabase Auth (JWT)
* Supabase Storage via REST (optional)

### Forbidden

* Supabase Edge Functions for ingestion
* Supabase RLS for business logic
* Supabase client libraries in Java

Supabase RLS should be **minimal or disabled** for backend‑owned tables.

---

## Observability (REQUIRED)

Claude must ensure:

* Structured logs per ingestion step
* Ingestion job state stored in DB
* Model version stored with AI decision

---

## Existing Supabase assets (IMPORTANT CONTEXT)

The repository already contains a `/supabase` folder.

This folder includes:

* Database schema and migration scripts
* SQL functions
* Existing Supabase Edge Functions

Claude must:

* Treat the `/supabase` folder as **reference material**, not active application logic
* Read existing SQL and Edge Functions to understand current behavior
* Migrate logic from Edge Functions into Java **incrementally and explicitly**
* Avoid blindly re-implementing logic without understanding existing behavior

---

## Current system behaviour (AS-IS)

Before migration, the system works as follows:

1. Chrome extension scrapes Facebook posts using the user’s authenticated session
2. Raw posts are written directly to Supabase tables
3. A polling-based process (Edge Functions / jobs):

    * Reads raw posts
    * Uses AI to determine whether the post is a real estate listing
    * If classified as real estate, extracts fields
    * Creates a listing record

This polling + AI classification behaviour is the **baseline reference**.

Claude’s task is to:

* Preserve the functional behaviour
* Improve structure, observability, and reliability
* Move polling, AI, and listing creation into the Java backend

---

## Migration constraints

* Chrome extension is untrusted input
* No breaking changes to frontend auth
* No downtime ingestion
* Edge Functions may coexist temporarily

---

## Definition of done

A feature is complete ONLY if:

* JWT is validated via Supabase
* Raw data is persisted before processing
* Failures are retryable
* No auth logic is duplicated
* No AI calls are synchronous

---

## Final instruction to Claude

**Do not be clever. Be correct.**

Follow this document over any default assumptions.
