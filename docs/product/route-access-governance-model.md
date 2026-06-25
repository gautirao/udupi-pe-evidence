# Route Access Governance Model

Date: 2026-06-25

## Purpose

This document defines the target route, access, login, logout, and user-governance model for `udupi-property-explorer`.

It is based on the URL/access/journey audit that identified 22 frontend page routes, 41 backend endpoints across 23 controller classes, and three major query-param based discovery journeys: area-first, school-first, and agri-first.

The goal is not only to list routes. The goal is to make route ownership, role access, post-login behaviour, and admin governance predictable as the product scales across many cities.

## Product direction

The product is evolving into four related but distinct surfaces:

1. **Public discovery app** — buyers and visitors browse listings, areas, schools, agricultural land, and trend insights.
2. **Authenticated user workspace** — normal logged-in users save areas, request viewings, manage bookings, and create owner listings.
3. **Broker workspace** — brokers manage listings, bookings, listing quality, demand gaps, and area intelligence.
4. **Admin console** — admins moderate listings, manage users/roles, validate localities/intelligence, inspect ingestion/data quality, and govern the platform.

The current implementation mixes some of these surfaces. For example, `/broker/listings/new` is currently a shared listing creation route for users, brokers, dealers, and admins, even though the URL suggests a broker-only surface.

## Current audit findings to preserve

The route/access audit found the following important facts:

- Public discovery routes are largely open and unauthenticated.
- The app has a strong broker workspace under `/broker/*`.
- Admin routes already live under `/admin/*`.
- Query-param journeys on `/discover` are powerful but need a formal contract.
- `dealer` is a legacy role/name that still exists alongside modern `broker`.
- The backend already accepts `user`, `broker`, `dealer`, and `admin` for listing creation/management where permitted.
- The frontend currently blocks the modern `broker` role from `NewListing` and `EditListing`; issue #1632 tracks the immediate fix.
- Several stale/dead surfaces exist and should not be cleaned up before the desired route model is agreed.

## Governance principles

1. **Routes should reflect user intent, not implementation history.**
   - Shared listing creation should not permanently live under a broker-only namespace.
   - Admin-only operations should remain under `/admin/*`.

2. **Access decisions must be centralised and testable.**
   - Route guards, navigation visibility, and backend authorization should be driven by the same role/capability model.
   - The app should avoid scattered checks such as `role !== 'dealer' && role !== 'admin' && role !== 'user'`.

3. **Navigation visibility must match route access.**
   - A user should not see a navigation item that the target route immediately blocks.
   - If a route is accessible only after onboarding, the navigation should guide the user to onboarding first.

4. **Authentication and authorization are separate.**
   - Authentication answers: who is logged in?
   - Authorization answers: what can this person do?

5. **Role assignment must be auditable.**
   - Admin role changes, broker approvals, deactivations, and deletes must be logged.

6. **Public routes should remain stable and deep-linkable.**
   - Discovery and trend URLs should remain shareable.
   - Query-param journey states must be documented and tested.

7. **Admin can eventually split into a separate app without changing the domain model.**
   - The route model should make a future admin app split straightforward.

## Target role model

| Role / state | Meaning | Target capabilities |
| --- | --- | --- |
| `PUBLIC` | Anonymous visitor | Browse discovery, listing details, public trends, public area/school/agri pages. |
| `USER` | Logged-in standard user | Save areas, request viewings, manage own bookings, create owner listings, edit own listings. |
| `BROKER` | Professional broker | Manage broker listings, bookings, dashboard, demand gaps, listing quality, area intelligence. |
| `DEALER` | Legacy broker-compatible role | Temporary backwards-compatible alias for `BROKER`. Should be phased out after migration. |
| `ADMIN` | Platform administrator | Moderate listings, manage users/roles, approve brokers, validate areas/data, inspect audit and ingestion state. |
| `SUSPENDED` or disabled account state | User account blocked from platform actions | Cannot create listings, manage bookings, or access dashboards. Public browsing only if signed out or treated as blocked. |

## Target route ownership model

### Public app

These routes should stay public and shareable:

```text
/
/discover
/listing/:id
/trends
/trends/:citySlug/areas/:areaSlug
/auth
/auth/callback
```

Public discovery should include:

```text
/discover?journey=area-first
/discover?journey=school-first
/discover?journey=agri-first
```

The exact query-param contract should be tested and documented separately, but it should remain part of the public app.

### Authenticated shared user routes

Shared authenticated routes should not sit permanently under `/broker/*`:

```text
/listings/new
/listings/:id/edit
/my-listings
/my-bookings
/saved-areas
/account
/account/profile
/account/security
/account/notifications
```

Target behaviour:

- `USER`, `BROKER`, `DEALER`, and `ADMIN` can create listings where product rules allow it.
- Anonymous users visiting these routes go to `/auth?redirect=<original-url>`.
- Existing `/broker/listings/new` and `/broker/listings/:id/edit` can remain as aliases during migration.

### Broker workspace

Broker-specific routes should remain under `/broker/*`:

```text
/broker/dashboard
/broker/listings
/broker/bookings
/broker/listing-quality
/broker/preferences
/broker/demand-gaps
/broker/areas/:citySlug/:areaSlug
```

Target broker entry point:

```text
/broker/dashboard
```

The broker dashboard should act as the command centre after login. It should show:

- listing status cards
- drafts and pending approvals
- bookings requiring action
- listing quality issues
- demand gap opportunities
- next best action section
- setup/onboarding completion status if incomplete

### Admin console

Admin-specific routes should live under `/admin/*`:

```text
/admin/dashboard
/admin/listings/pending
/admin/listings
/admin/duplicates
/admin/localities
/admin/intelligence
/admin/ingestion
/admin/data-quality
/admin/users
/admin/users/:userId
/admin/users/:userId/roles
/admin/brokers/applications
/admin/audit-log
/admin/system/route-access
```

Some of these routes already exist in some form; others are target routes needed for governance.

Admin should land on:

```text
/admin/dashboard
```

If `/admin/dashboard` does not yet exist, the temporary landing page should be:

```text
/admin/listings/pending
```

### Deprecated / legacy aliases

Legacy aliases should be managed explicitly:

```text
/dealer/listings/new        -> /listings/new or /broker/listings/new during migration
/dealer/setup               -> /broker/setup or removed after migration
/insights                   -> /trends
```

Each alias must have a decision:

- keep as permanent alias
- redirect for one release window
- remove after tests and links are updated

## Login lifecycle

### Anonymous user visits public page

Expected behaviour:

- Stays on the page.
- Can browse public discovery and trends.
- Sees sign-in/create-listing CTAs where relevant.

### Anonymous user visits protected page

Expected behaviour:

```text
/protected-url -> /auth?redirect=/protected-url
```

After successful login, the app should return the user to the original protected URL if they are authorized.

If the user is authenticated but not authorized for the requested URL, route to a role-appropriate landing page with a clear message.

### First login after sign-up

Default behaviour:

```text
new signup -> USER role -> /onboarding
```

The onboarding page should ask what the person wants to do:

- browse and save areas
- create an owner listing
- become a broker

Broker onboarding should not silently grant full broker capability in production. It should produce either:

```text
BROKER_PENDING
```

or a broker profile requiring admin approval, unless the product intentionally allows self-service brokers.

### Post-login landing rules

| User state | Target landing | Notes |
| --- | --- | --- |
| Anonymous with redirect target | original requested URL | Only if authorized after login. |
| New `USER` with no onboarding complete | `/onboarding` | Guide to browse, create owner listing, or broker setup. |
| Returning `USER` | `/discover` or previous public page | If they initiated booking/listing, return to that flow. |
| `USER` with listing drafts | `/my-listings` or `/listings/new` continuation | Consider surfacing incomplete drafts. |
| `BROKER` onboarding incomplete | `/broker/setup` | Must complete setup before dashboard actions. |
| Active `BROKER` | `/broker/dashboard` | Main command centre. |
| `ADMIN` | `/admin/dashboard` or `/admin/listings/pending` until dashboard exists | Admin should not land on public discovery by default. |
| Suspended/deactivated user | `/auth` or blocked-account page | Must not access authenticated actions. |

### Logout lifecycle

Logout should behave consistently from every page.

| Current page type | After logout target | Expected behaviour |
| --- | --- | --- |
| Public route | stay on same page or return to `/` | User becomes anonymous. Public content remains visible. |
| User route | `/auth` or `/` | Protected user data cleared. |
| Broker route | `/auth` | Broker workspace no longer accessible. |
| Admin route | `/auth` | Admin shell no longer accessible. |
| In-progress listing form | confirm before logout if unsaved changes | Avoid data loss. |

The app should clear local auth state, cached user profile/role, role-specific navigation, and any sensitive dashboard data.

### Expired session / token refresh failure

Expected behaviour:

- Public pages continue as anonymous where possible.
- Protected pages redirect to `/auth?redirect=<current-url>`.
- Mutating actions fail safely and show a sign-in-required message.
- No stale role navigation should remain visible after auth state is lost.

## Role assignment and user governance

The product needs explicit admin user governance before scale.

### Current signup model

Users and brokers can start from the login/signup flow. This is good for growth, but role governance must be explicit.

### Target admin capabilities

Admins need a user management surface:

```text
/admin/users
/admin/users/:userId
/admin/users/:userId/roles
```

Capabilities:

- search users by email/name/role/status
- view user profile and linked broker profile
- assign role
- revoke role
- approve broker application
- suspend account
- reactivate account
- delete or anonymize account where legally/product-safe
- view listing count, booking count, and moderation history
- view role change audit log

### Role assignment rules

Suggested policy:

- New signups default to `USER`.
- Broker self-service signup creates a broker profile in `PENDING` state.
- Admin approves broker profile and grants `BROKER`.
- `DEALER` remains legacy-only and should not be assigned to new users.
- Admin assignment/revocation must be audit logged.
- The platform must prevent removal of the final active admin.
- Suspended users must not create listings, manage bookings, or access broker/admin dashboards.

### Delete vs deactivate

For safety, the admin UI should distinguish:

- **Deactivate/suspend**: immediate access removal, preserves records.
- **Delete/anonymize**: irreversible or compliance-sensitive action, should be rare and audited.

Listings, bookings, moderation logs, and audit trails should not be orphaned accidentally.

## Admin app split model

The product may later split into:

```text
app.retrends.in          public + user + broker app
admin.retrends.in        admin console
```

or equivalent domains.

To make this split easier:

1. Keep all admin routes under `/admin/*` now.
2. Avoid importing admin-only components into public/broker bundles where possible.
3. Keep admin APIs under `/api/admin/*` unless there is a strong reason otherwise.
4. Use the same auth provider and role claims across both apps.
5. Use shared design tokens/components, but separate admin navigation and route shells.
6. Add route-level tests proving non-admins cannot access admin pages.

### What moves to the admin app

Target admin-only surfaces:

```text
/admin/dashboard
/admin/listings/pending
/admin/listings
/admin/duplicates
/admin/localities
/admin/intelligence
/admin/ingestion
/admin/data-quality
/admin/users
/admin/users/:userId
/admin/brokers/applications
/admin/audit-log
/admin/system/route-access
```

### What stays in the main app

```text
/
/discover
/listing/:id
/trends
/auth
/onboarding
/listings/new
/listings/:id/edit
/my-listings
/my-bookings
/saved-areas
/broker/dashboard
/broker/listings
/broker/bookings
/broker/listing-quality
/broker/demand-gaps
/broker/areas/:citySlug/:areaSlug
```

## Route/capability implementation model

The codebase should move toward a central route/capability registry.

Example conceptual shape:

```ts
const ROUTES = {
  listingNew: {
    path: '/listings/new',
    legacyAliases: ['/broker/listings/new', '/dealer/listings/new'],
    requiresAuth: true,
    capabilities: ['listing:create'],
  },
  brokerDashboard: {
    path: '/broker/dashboard',
    requiresAuth: true,
    capabilities: ['broker:dashboard:view'],
  },
  adminUsers: {
    path: '/admin/users',
    requiresAuth: true,
    capabilities: ['admin:users:manage'],
  },
}
```

Role-to-capability mapping should be explicit:

```text
USER:
  listing:create:owner
  booking:create
  saved-area:manage

BROKER:
  listing:create:broker
  listing:manage:own
  broker-dashboard:view
  broker-demand:view
  booking:manage:received

ADMIN:
  admin:* and moderation capabilities
```

The same concepts should guide:

- route guards
- sidebar/nav visibility
- post-login landing
- backend authorization tests
- e2e smoke tests

## Query-param journey governance

`/discover` is one route with several product journeys. These should be documented as route states, not treated as accidental query strings.

Target documentation for each journey:

| Journey | Required params | Optional params | Default landing | Expected panel | Expected map state |
| --- | --- | --- | --- | --- | --- |
| area-first | `journey=area-first`, `city` | `groupId`, `areaKey`, `groupResults` | area group list | area/region panel | area markers/groups |
| school-first | `journey=school-first`, `city` | `groupId`, `areaKey`, `schoolId`, `radiusKm`, `board` | school/area selection | school panel or listings panel | school markers/radius |
| agri-first | `journey=agri-first`, `city` | `region`, `maxKm`, `agriAcresMin`, `listing`, `locality` | agri corridor selection | agri panel | direction/corridor overlays |

Each journey should have:

- URL builder helpers
- parser/normalizer tests
- route-state fallback behaviour
- e2e smoke for at least one deep link

## Required admin routes not yet fully governed

The audit shows admin has moderation/locality/intelligence functions, but the following governance routes are needed for scale:

### `/admin/dashboard`

Admin command centre:

- pending listings
- suspected duplicates
- broker applications
- data-quality alerts
- ingestion errors
- unresolved locality mappings
- recent audit events

### `/admin/users`

User search and management:

- search/filter users
- role/status filters
- quick actions: view, suspend, approve broker, revoke role

### `/admin/users/:userId`

User detail:

- profile
- role history
- listings
- bookings
- broker profile if any
- moderation history
- account status

### `/admin/users/:userId/roles`

Role management:

- assign role
- revoke role
- approve broker
- suspend/reactivate
- audit reason required

### `/admin/brokers/applications`

Broker onboarding queue:

- pending broker profiles
- verification status
- approve/reject
- notes/audit trail

### `/admin/audit-log`

Platform audit:

- role changes
- listing moderation
- admin actions
- ingestion actions
- data correction actions

### `/admin/system/route-access`

Operational route/access matrix:

- generated/current route matrix
- role access expectations
- mismatches between frontend and backend

This does not need to be user-facing initially. A docs or test-generated report is acceptable as the first version.

## Implementation phases

### Phase 0 — Immediate bugfix

Tracked separately by issue #1632.

- Allow modern `broker` role to access existing listing create/edit flows.

### Phase 1 — Centralize route access policy

- Add route/capability definitions for key frontend routes.
- Replace scattered role checks with shared helpers where practical.
- Align navigation visibility with route access.
- Add route guard tests for `PUBLIC`, `USER`, `BROKER`, `DEALER`, and `ADMIN`.

### Phase 2 — Auth lifecycle and post-login landing

- Add redirect preservation for protected pages.
- Define role-aware post-login landing.
- Ensure logout behaves consistently from public, user, broker, and admin pages.
- Ensure token expiry clears sensitive role-specific state.

### Phase 3 — Shared listing route migration

- Introduce `/listings/new` and `/listings/:id/edit` as canonical shared authenticated routes.
- Keep `/broker/listings/new` and `/broker/listings/:id/edit` as temporary aliases/redirects.
- Decide `/dealer/*` alias removal window.

### Phase 4 — Admin user and role governance

- Add `/admin/users` and `/admin/users/:userId`.
- Add role assignment/revocation flow with audit reason.
- Add broker approval queue.
- Add account suspend/reactivate capability.
- Protect final-admin safety.

### Phase 5 — Admin split readiness

- Create admin shell boundaries.
- Reduce admin imports in public app bundle where practical.
- Ensure all admin APIs are under `/api/admin/*` or explicitly documented.
- Add tests to prove app can be split later.

### Phase 6 — Cleanup stale aliases/components

Only after phases 1-3 clarify the route model:

- remove or redirect stale `/dealer/*` routes
- remove unused React pages
- resolve unused dashboard search endpoint/hook
- remove stale aliases after a release window

## Definition of Done for implementation

- [ ] Route/capability policy exists in one place for key app routes.
- [ ] Navigation visibility uses the same policy or a clearly related helper.
- [ ] Login redirect preservation works for protected routes.
- [ ] Post-login landing is role-aware.
- [ ] Logout behaviour is consistent across public, user, broker, and admin routes.
- [ ] Shared listing creation/edit routes are canonical or migration plan is implemented with aliases.
- [ ] Admin user-management route skeleton exists.
- [ ] Admin role assignment/revocation design is implemented or stubbed behind feature flags.
- [ ] Broker onboarding/approval model is explicit.
- [ ] `dealer` legacy handling is documented and tested.
- [ ] Query-param discover journeys have URL builder/parser tests.
- [ ] Route guard tests cover public/user/broker/dealer/admin cases.
- [ ] E2E smoke covers one route per major surface.
- [ ] No public route becomes accidentally authenticated.
- [ ] No admin route becomes visible to non-admins.

## Non-goals

- Do not redesign the visual UI as part of route governance.
- Do not remove legacy aliases until tests and redirects are agreed.
- Do not split the admin app physically until the route shell and API boundaries are ready.
- Do not change public discover URL semantics without explicit migration handling.

## Open product decisions

1. Should broker self-signup immediately grant `BROKER`, or create `BROKER_PENDING` until admin approval?
2. Should admins create listings through the same public listing wizard or a separate admin-assisted flow?
3. Should `/my-listings` exist for users, or should all listing management remain under `/broker/listings` until route migration?
4. How long should `/dealer/*` redirects remain?
5. Should admin live under `/admin/*` in the same SPA for MVP, or move to a separate deployable shell before broader rollout?
6. What is the exact legal/compliance policy for deleting users versus suspending/anonymizing them?
