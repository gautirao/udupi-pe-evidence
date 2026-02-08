# Deployment Rules

## Supabase Usage Constraints
- Supabase is managed infrastructure: Auth, Postgres, Storage only
- No Supabase client libraries for Java (they do not exist)
- Do not create Java Supabase SDK abstractions
- Do not move business logic back into Edge Functions
- Supabase is NOT an application framework

## Java Spring Boot Responsibilities
All ingestion, processing, and business logic runs in the Spring Boot backend.
The backend connects to Supabase Postgres directly (not through Supabase client libraries).

## Data Rules
- Raw data must be persisted before any processing
- Do not query raw scraped data directly for dashboards
- Process and transform data into clean tables for dashboard consumption

## Migration Philosophy
- Database migrations should be versioned (Flyway)
- Each migration should be idempotent where possible
- Test migrations against a copy before applying to production
