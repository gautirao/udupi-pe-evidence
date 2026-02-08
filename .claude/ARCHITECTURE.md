# Architecture Rules

## Project Goal
Migrate all ingestion, processing, and business logic from Supabase Edge Functions into a **Java (Spring Boot) backend**, while intentionally keeping Supabase as infrastructure (Auth, Postgres, Storage).

## High-Level Architecture

```
Chrome Extension (Facebook scraping)
↓  (Supabase JWT)
Java Spring Boot Backend
↓
Supabase Postgres
```

## Supabase Role
Supabase is **managed infrastructure**, NOT an application framework.
It provides: Auth, Postgres, Storage.
It does NOT provide: business logic, processing, ingestion.

## Non-Goals (NEVER do these)

Claude must **never**:
- Re-implement authentication (passwords, OAuth, sessions)
- Re-implement Google / Facebook login
- Store user credentials
- Create a Java Supabase "SDK" abstraction
- Move business logic back into Edge Functions
- Use Supabase client libraries for Java (they do not exist and are not desired)
- Put AI calls on synchronous user request paths
- Query raw scraped data directly for dashboards

## AI Usage Rules
- No AI calls on synchronous user request paths
- Raw data must be persisted before any AI processing
