# Dev Cleanup Guide

This document provides step-by-step instructions for safely deleting test data from your local or development database.

---

## Overview

The `scripts/dev_reset.sql` script safely removes all test data while preserving:
- User accounts and roles
- Facebook group configurations
- Location cache
- Analytics data

**Use cases:**
- Reset database after testing dealer listing flows
- Clean up after manual QA
- Start fresh for a new sprint
- Prepare for integration tests

---

## What Gets Deleted

| Table | What's removed | Impact |
|-------|----------------|--------|
| `listing_images` | All dealer-uploaded images | Image URLs in Supabase Storage are NOT deleted (manual cleanup required) |
| `notifications` | All in-app notifications | Users will have empty notification feeds |
| `property_listings` | ALL listings (DRAFT, PENDING_REVIEW, LIVE, REJECTED, SCRAPED) | Map will be empty, dealer dashboards empty |
| `user_saved_areas` | All user area preferences | Users will need to re-save areas |
| `raw_posts` | All scraped Facebook posts | Ingestion history is cleared |
| `feed_runs` | All ingestion job records | Job history is cleared |

---

## What Is Preserved

| Table/Object | Why preserved |
|--------------|---------------|
| `auth.users` | User accounts remain intact |
| `profiles` | User profile data (name, avatar) retained |
| `user_roles` | Role assignments (admin, dealer, user) retained |
| `facebook_groups` | Scraping configuration retained |
| `geocode_cache` | Location lookups retained (no need to re-fetch) |
| `area_stats_latest` | Analytics materialized view retained |
| `area_price_weekly` | Price trend data retained |

---

## Safety Features

The script includes multiple safety guards:

1. **Database name check**: Refuses to run if database name contains "prod"
2. **Environment variable check**: Refuses to run if `app.environment = 'production'`
3. **Transaction wrapper**: All deletions are atomic (all-or-nothing)
4. **Verification output**: Shows row counts before and after deletion

---

## Prerequisites

1. **Supabase connection**: You must have local Supabase credentials or direct database access
2. **Admin privileges**: Your database user must have DELETE permissions on all tables
3. **Backup (optional)**: If you want to preserve any data, take a snapshot first

---

## Step-by-Step Instructions

### Option A: Using psql (Command Line)

1. **Verify your environment**
   ```bash
   # Check your current database connection
   psql -h localhost -U postgres -d your_database_name -c "SELECT current_database();"
   ```

2. **Confirm you're NOT in production**
   ```bash
   # Database name should NOT contain 'prod'
   # Example good names: udupi_dev, udupi_local, postgres
   # Example BAD names: udupi_prod, production_db
   ```

3. **Run the cleanup script**
   ```bash
   cd /path/to/udupi-property-explorer
   psql -h localhost -U postgres -d your_database_name -f scripts/dev_reset.sql
   ```

4. **Review the output**
   You should see:
   ```
   NOTICE:  Environment check PASSED. Database: your_database_name. Proceeding with cleanup...
   NOTICE:  ✓ Deleted X rows from listing_images
   NOTICE:  ✓ Deleted X rows from notifications
   NOTICE:  ✓ Deleted X rows from user_saved_areas
   NOTICE:  ✓ Deleted X rows from property_listings
   NOTICE:  ✓ Deleted X rows from raw_posts
   NOTICE:  ✓ Deleted X rows from feed_runs
   NOTICE:
   NOTICE:  === CLEANUP COMPLETE ===
   NOTICE:  Remaining row counts (should all be 0):
   NOTICE:    listing_images: 0
   NOTICE:    notifications: 0
   NOTICE:    user_saved_areas: 0
   NOTICE:    property_listings: 0
   NOTICE:    raw_posts: 0
   NOTICE:    feed_runs: 0
   NOTICE:
   NOTICE:  ✓ All test data successfully deleted.
   ```

### Option B: Using Supabase SQL Editor

1. **Open Supabase Dashboard**
   - Navigate to your project
   - Go to **SQL Editor**

2. **Verify environment**
   - Check the database name in the top bar
   - Ensure it's your dev/local project, NOT production

3. **Copy and paste the script**
   - Open `scripts/dev_reset.sql`
   - Copy the entire contents
   - Paste into the SQL Editor

4. **Run the script**
   - Click **Run** (or press Cmd+Enter / Ctrl+Enter)
   - Review the output in the **Results** panel

### Option C: Using DBeaver or DataGrip

1. **Open a new SQL console** connected to your dev database
2. **Verify connection**: Check the database name in the connection info
3. **Open the script file**: `scripts/dev_reset.sql`
4. **Execute the script**: Run the entire file
5. **Review output**: Check the console for NOTICE messages

---

## Verification Steps

After running the script, verify the cleanup:

### 1. Check table counts
```sql
SELECT
    (SELECT COUNT(*) FROM listing_images) AS listing_images,
    (SELECT COUNT(*) FROM notifications) AS notifications,
    (SELECT COUNT(*) FROM user_saved_areas) AS user_saved_areas,
    (SELECT COUNT(*) FROM property_listings) AS property_listings,
    (SELECT COUNT(*) FROM raw_posts) AS raw_posts,
    (SELECT COUNT(*) FROM feed_runs) AS feed_runs;
```

All counts should be **0**.

### 2. Verify preserved data
```sql
-- Users should still exist
SELECT COUNT(*) FROM auth.users;

-- Roles should still exist
SELECT COUNT(*) FROM user_roles;

-- Facebook groups should still exist
SELECT COUNT(*) FROM facebook_groups;
```

These counts should be **non-zero** (unless you never created any).

### 3. Test the application
- Start the backend: `cd backend && mvn spring-boot:run`
- Start the frontend: `npm run dev`
- Login with an existing user
- Verify:
  - Map shows no listings
  - Dealer dashboard is empty
  - Notifications are empty
  - Insights dashboard shows no data (or minimal data from preserved analytics)

---

## Troubleshooting

### Error: "Database name contains prod"
```
ERROR:  SAFETY ABORT: Database name "udupi_prod" contains "prod"...
```

**Cause:** The script detected a production-like database name.

**Solution:**
- If this is truly a dev database, rename it to not include "prod"
- If this is production, **DO NOT run this script**

### Error: "app.environment is set to production"
```
ERROR:  SAFETY ABORT: app.environment is set to "production"...
```

**Cause:** Your database has an environment configuration variable set to production.

**Solution:**
- Verify you're connected to the correct database
- If it's truly dev, unset the variable or change it:
  ```sql
  ALTER DATABASE your_database_name SET app.environment = 'development';
  ```

### Error: Foreign key constraint violation
```
ERROR:  update or delete on table "property_listings" violates foreign key constraint...
```

**Cause:** There may be additional tables with foreign keys not handled by the script.

**Solution:**
- Check for custom tables you may have added
- Add those tables to the deletion order in the script
- Report this as a bug if it's a core table

### Some rows remain after cleanup
```
WARNING:  Some tables still contain data. Check for FK constraints or permissions.
```

**Cause:** Deletion may have been blocked by:
- Row-level security (RLS) policies
- Insufficient permissions
- Trigger failures

**Solution:**
```sql
-- Temporarily disable RLS (as superuser)
ALTER TABLE listing_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE property_listings DISABLE ROW LEVEL SECURITY;
ALTER TABLE raw_posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE feed_runs DISABLE ROW LEVEL SECURITY;

-- Re-run the deletion statements manually
DELETE FROM listing_images;
DELETE FROM notifications;
DELETE FROM user_saved_areas;
DELETE FROM property_listings;
DELETE FROM raw_posts;
DELETE FROM feed_runs;

-- Re-enable RLS
ALTER TABLE listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_runs ENABLE ROW LEVEL SECURITY;
```

### Script runs but application still shows data
**Cause:** Frontend may be caching data.

**Solution:**
- Clear browser cache and local storage
- Hard refresh (Cmd+Shift+R / Ctrl+Shift+F5)
- Restart the backend server

---

## Manual Cleanup: Supabase Storage

**Important:** This script does NOT delete uploaded image files from Supabase Storage.

To manually clean up storage:

1. **Via Supabase Dashboard:**
   - Go to **Storage** > **listing-images** bucket
   - Select all files
   - Click **Delete**

2. **Via SQL (metadata only):**
   ```sql
   -- List storage objects (read-only, for inspection)
   SELECT * FROM storage.objects WHERE bucket_id = 'listing-images';
   ```

3. **Via Supabase CLI:**
   ```bash
   supabase storage empty listing-images
   ```

---

## Running on Empty Database

The script is safe to run on an empty database:
- All DELETE statements will succeed (deleting 0 rows)
- No errors will be raised
- Verification will show all counts as 0

---

## When to Run This Script

| Scenario | When to run |
|----------|-------------|
| **After manual testing** | After QA rounds to reset for next test cycle |
| **Before integration tests** | Ensure clean state before automated tests |
| **Sprint boundaries** | Clean slate at start of new sprint |
| **Demo prep** | Remove old test data before demo setup |
| **After data corruption** | Nuclear option to fix bad test data |

---

## Alternative: Partial Cleanup

If you want to delete only specific subsets:

### Delete only dealer listings (preserve scraped)
```sql
DELETE FROM listing_images WHERE listing_id IN (
    SELECT id FROM property_listings WHERE status IN ('DRAFT', 'PENDING_REVIEW', 'REJECTED')
);
DELETE FROM property_listings WHERE status IN ('DRAFT', 'PENDING_REVIEW', 'REJECTED');
```

### Delete only old notifications
```sql
DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '7 days';
```

### Delete only specific user's data
```sql
DELETE FROM user_saved_areas WHERE user_id = 'USER_UUID_HERE';
DELETE FROM notifications WHERE user_id = 'USER_UUID_HERE';
```

---

## Getting Help

If you encounter issues not covered here:

1. Check the script output for specific error messages
2. Verify your database connection and permissions
3. Review `PROJECT_CONTEXT.md` for environment details
4. Check Supabase logs if using hosted Supabase
5. Open an issue with:
   - Full error message
   - Database name (sanitized)
   - Environment (local, Supabase, Render, etc.)
   - Steps you followed

---

## Related Documentation

- `PROJECT_CONTEXT.md` — System architecture and deployment
- `docs/SPRINT_01_PLAN.md` — Sprint 1 task breakdown (see A4)
- `backend/src/main/resources/db/migration/` — Database schema migrations
- `.claude/ARCHITECTURE.md` — Architectural invariants

---

**Last updated:** 2026-02-13
**Task:** Sprint 1 A4 (Dev cleanup tooling)
**Status:** Complete

---

## Secrets Hygiene (Critical Security Practice)

### Never Commit Secrets to Git

**Files that MUST NEVER be committed**:
- `.env` (any .env file at any level)
- `backend/.env`, `backend/.env.local`, `backend/.env.production`
- `.claude/settings.local.json`
- Any file containing: passwords, API keys, tokens, certificates

### If You Accidentally Commit Secrets

1. **IMMEDIATELY rotate the exposed credentials**:
   - Supabase: Dashboard → Settings → Database → Reset password
   - Google Cloud: Console → APIs & Services → Credentials → Regenerate key
   - Any other service: Revoke and regenerate immediately

2. **Remove from Git history** (coordinate with team first):
   ```bash
   # Use BFG Repo-Cleaner (safer than git filter-branch)
   brew install bfg  # macOS
   git clone --mirror <repo-url> repo-cleanup.git
   cd repo-cleanup.git
   bfg --delete-files .env
   bfg --delete-files settings.local.json
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   git push --force --all
   ```

3. **Verify cleanup**:
   ```bash
   git log --all --oneline -- backend/.env  # Should return nothing
   ```

### Use Environment Variables Instead

**Development**:
- Create `.env.example` with placeholder values (safe to commit)
- Copy to `.env` and fill in real values (never commit)
- Add `.env` to `.gitignore`

**Production** (Render, Cloudflare Pages):
- Set environment variables in platform dashboards
- Never hardcode secrets in source code
- Use secret management services if available

### Template .env.example

Create `backend/.env.example`:
```
# Database (get from Supabase dashboard)
SUPABASE_DB_URL=postgresql://postgres.<project-id>.supabase.co:5432/postgres
SUPABASE_DB_PASSWORD=<your-password-here>

# AI Service (get from Google Cloud Console)
AI_API_KEY=<your-google-ai-key-here>

# Never commit the actual .env file!
```
