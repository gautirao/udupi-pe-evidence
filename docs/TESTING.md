# Testing Guide

## Unit Tests

```bash
# Frontend (Vitest)
npm run test

# Backend (JUnit + Testcontainers)
cd backend && mvn test
```

---

## E2E Tests (Playwright)

E2E tests run Playwright against a live frontend + backend. There are two modes:

| Mode | Command | Target |
|---|---|---|
| Local | `npm run test:e2e:local` | `localhost:8080` / `localhost:8085` |
| Production/CI | `npm run test:e2e` | Deployed production URLs |

### Local Mode Setup

**1. Create `.env.e2e` at the project root** (never committed to git):

```bash
cp .env.e2e.example .env.e2e
```

**2. Replace placeholder values with real Supabase test user credentials.**

The file must contain real accounts — placeholder `@example.com` values will cause all auth-dependent tests to skip.

```
PLAYWRIGHT_BASE_URL=http://localhost:8080
BACKEND_BASE_URL=http://localhost:8085
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>

# Real Supabase test users (see "Creating Test Users" below)
SMOKE_USER_EMAIL=e2e-user@<your-domain>
SMOKE_USER_PASSWORD=<strong-password>
DEALER_EMAIL=e2e-dealer@<your-domain>
DEALER_PASSWORD=<strong-password>
ADMIN_EMAIL=e2e-admin@<your-domain>
ADMIN_PASSWORD=<strong-password>
```

**3. Start the backend first**, then run:

```bash
npm run test:e2e:local
```

The script starts Vite dev server, waits for both servers to be ready, then runs Playwright.

---

### Creating Test Users in Supabase

You need three accounts with specific roles in the `user_profiles` table:

| Email | Role in `user_profiles` |
|---|---|
| `SMOKE_USER_EMAIL` | `user` |
| `DEALER_EMAIL` | `dealer` |
| `ADMIN_EMAIL` | `admin` |

**Steps:**

1. Go to [Supabase Dashboard](https://supabase.com) → your project → Authentication → Users
2. Click "Add user" for each of the three accounts
3. After creation, run the following in the SQL editor to set roles:

```sql
-- Replace emails with your actual test user emails
UPDATE user_profiles SET role = 'user'   WHERE email = 'e2e-user@your-domain';
UPDATE user_profiles SET role = 'dealer' WHERE email = 'e2e-dealer@your-domain';
UPDATE user_profiles SET role = 'admin'  WHERE email = 'e2e-admin@your-domain';
```

4. Confirm email for each user (Authentication → Users → click user → "Send confirmation email" or disable email confirmation in Auth settings for test purposes).

---

### CI Setup (GitHub Actions)

The `e2e` CI job (`.github/workflows/ci.yml`) runs after each merge to `main` against the deployed production environment. It reads credentials from GitHub repository secrets.

**Required secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `PLAYWRIGHT_BASE_URL` | Production frontend URL |
| `BACKEND_BASE_URL` | Production backend URL |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `SMOKE_USER_EMAIL` | Real test user email (role: user) |
| `SMOKE_USER_PASSWORD` | Real test user password |
| `DEALER_EMAIL` | Real dealer email (role: dealer) |
| `DEALER_PASSWORD` | Real dealer password |
| `ADMIN_EMAIL` | Real admin email (role: admin) |
| `ADMIN_PASSWORD` | Real admin password |

If secrets are not set (or are set to placeholder `@example.com` values), auth-dependent tests will skip and the CI job will pass on the unauthenticated tests only.

---

### Test Coverage Map

| ID | Test | Auth required |
|---|---|---|
| Q1 | App loads without blank screen | No |
| Q2 | Protected route redirects to /auth | No |
| Q3 | Login with valid credentials succeeds | User |
| Q4 | No CORS errors navigating public pages | No |
| Q5 | Unauthenticated ingestion POST returns 401/403 | No (backend) |
| Q6 | Logged-out nav: dealer/admin links absent | No |
| Q7 | Duplicate booking rejected with 409 | User |
| N1 | User role: correct nav links after login | User |
| N2 | Admin role: Admin dropdown + nav links | Admin |
| N3 | Unknown route renders 404 | No |
| D1 | Dealer can access /dealer/dashboard | Dealer |
| D2 | Dealer can access /dealer/listings | Dealer |
| D3 | Dealer can access /dealer/bookings | Dealer |
| D4 | Non-dealer redirected from /dealer/dashboard | No |
| A1 | Admin can access /admin/listings/pending | Admin |
| A2 | Admin can access /admin/localities | Admin |
| A3 | Admin can access /admin/listings | Admin |
| A4 | Unauthenticated user redirected from /admin | No |
| L1–L4 | Listing lifecycle (create, view, book) | Dealer + User |
| M1–M4 | Map filters, BHK filter, search, Insights | User |
| U1–U4 | User journeys: saved areas, bookings, insights | User |
