# Architecture Rules

This document defines **architectural invariants**.
These rules describe what must **never change**, regardless of implementation details.

System facts (current layout, endpoints, providers) live in `PROJECT_CONTEXT.md`.

---

## Project Goal (Invariant)

Migrate all ingestion, processing, and business logic from Supabase Edge Functions into a
**Java (Spring Boot) backend**, while intentionally keeping Supabase as infrastructure only.

This direction is non-negotiable.

---

## Architectural Shape (Conceptual)

All application logic flows through the backend.

```
Chrome Extension (Facebook scraping) or Client ( browser or app ) 
↓  (Supabase JWT)
Java Spring Boot Backend
↓
Supabase Postgres
```

This is a **conceptual model**, not a deployment diagram.

---

## Supabase Role (Invariant)

Supabase is **managed infrastructure**, not an application framework.

Supabase provides:
- Authentication
- Postgres database
- Storage

Supabase must NOT be used for:
- Business logic
- Processing
- Ingestion
- Orchestration

No exceptions.

---

## Backend Responsibilities (Invariant)

The Java Spring Boot backend is the **only place** where:
- Business rules live
- Data ingestion occurs
- Processing and enrichment happen
- AI services are invoked
- Authorization decisions are enforced

The backend must:
- Validate Supabase JWTs
- Treat the frontend as untrusted
- Own all domain logic

---

## Frontend Responsibilities (Invariant)

The frontend is responsible for:
- User interaction
- Supabase authentication (login, logout, OAuth)
- Sending Supabase JWTs to the backend

The frontend must NOT:
- Contain business logic
- Call AI services directly
- Bypass the backend for data access
- Store or process sensitive credentials

---

## Non-Goals (NEVER do these)

Claude must **never**:

- Re-implement authentication (passwords, OAuth, sessions)
- Re-implement Google or Facebook login logic
- Store user credentials
- Create or suggest a Java Supabase "SDK" abstraction
- Move business logic back into Edge Functions
- Use Supabase client libraries for Java
- Put AI calls on synchronous user request paths
- Query raw scraped or ingestion data directly for dashboards

Violating any item above is an architectural bug.

---

## AI Usage Rules (Invariant)

- AI calls must NEVER be on synchronous user request paths
- Raw data must be persisted before any AI processing
- AI is used only for:
    - classification
    - enrichment
    - analysis
- AI failures must not break core user flows

AI is a background capability, not a real-time dependency.

---

## Enforcement

If a proposed change conflicts with this document:
- STOP
- Call out the conflict explicitly
- Wait for human direction

Architecture rules override convenience, speed, and cleverness.
