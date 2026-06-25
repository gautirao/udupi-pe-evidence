# Auth Modal Login and Logout Governance

Date: 2026-06-25

## Purpose

This document captures the product decision that authentication should become a modal operation rather than a standalone full-page journey for normal app usage.

The current app has `/auth` as its own path. That is useful as a technical fallback, but it is not the preferred user experience for a discovery-led product where users may begin from a listing, map, trend page, school search, or broker CTA.

## Product decision

Login/signup should be presented as an in-context modal for normal user actions.

`/auth` may remain as a fallback route for:

- direct deep links
- auth provider redirects
- email magic-link callbacks where needed
- accessibility/no-JavaScript fallback if needed
- tests and technical recovery states

But user-facing CTAs should prefer opening an auth modal over navigating away from the current page.

## UX principles

1. **Do not interrupt discovery.**
   - Users should be able to browse public pages without being forced into auth.
   - Login should appear only when the user attempts an action that needs identity.

2. **Preserve context.**
   - If a user clicks save, book viewing, contact broker, create listing, or continue a protected journey, the auth modal should preserve the intended action and target URL.

3. **Return users to the thing they were doing.**
   - After login/signup, return to the original page/action if permitted.
   - Do not always dump users onto a generic dashboard.

4. **Keep protected routes deep-linkable.**
   - Direct visits to protected URLs should still work.
   - If unauthenticated, the user should see an auth modal or fallback `/auth?redirect=...`, not a confusing redirect loop.

5. **Logout should land safely, not always on `/auth`.**
   - After logout, public pages can remain visible as anonymous.
   - Protected surfaces should return to a safe public page.

## Target auth surfaces

### Auth modal

Primary user-facing auth surface.

Should support:

- sign in
- sign up
- password reset / magic link where supported
- role-intent capture where needed, for example `I want to list a property` or `I am a broker`
- redirect/action preservation
- clear close/cancel behaviour

### `/auth`

Secondary fallback route.

Allowed uses:

- direct auth URL
- provider redirect fallback
- email callback support
- tests
- cases where modal cannot be mounted

### `/auth/callback`

Technical callback route.

Should remain a route and should not be a modal.

## Login entry points

| Source/action | Preferred behaviour | After successful auth |
| --- | --- | --- |
| Header sign in | Open auth modal | Stay on current page unless role landing requested. |
| Save area/listing | Open auth modal with pending action | Complete save action, stay on same page. |
| Request viewing | Open auth modal with pending booking intent | Return to booking flow/modal. |
| Create listing CTA | Open auth modal with redirect/action `/listings/new` | Continue to listing creation after login. |
| Broker dashboard direct link | Auth modal or `/auth?redirect=/broker/dashboard` | Broker -> dashboard; non-broker -> onboarding/setup or safe landing. |
| Admin route direct link | Auth modal or `/auth?redirect=/admin/...` | Admin -> requested route; non-admin -> role-appropriate landing with not-authorized message. |
| Expired session during mutation | Auth modal with retry context | Retry or ask user to repeat action safely. |

## Post-login landing rules

The app should distinguish between **login because the user had an intent** and **login from a generic sign-in button**.

### Login with preserved intent

If the user opened auth because of an action or protected route:

1. authenticate
2. refresh role/profile state
3. verify the user is authorized for the preserved action/route
4. complete or resume the action where safe
5. show a clear message if the user is authenticated but not authorized

Examples:

- Save area -> auth -> save area -> remain on area/discover page.
- Book viewing -> auth -> resume booking request.
- Create listing -> auth -> `/listings/new` or current canonical listing route.
- Admin direct URL -> auth -> admin page only if admin.

### Generic login

If the user clicks a generic sign-in button without a pending action:

| Role/state | Landing |
| --- | --- |
| New user / onboarding incomplete | `/onboarding` |
| Returning `USER` | stay on current public page, or `/discover` if login started from `/auth` directly |
| User with incomplete listing draft | optional prompt to resume draft, not forced redirect |
| `BROKER` setup incomplete | `/broker/setup` |
| Active `BROKER` | `/broker/dashboard` |
| `ADMIN` | `/admin/dashboard` if present, else `/admin/listings/pending` |
| Suspended/deactivated | blocked-account state |

## Logout landing rules

Logout should be based on where the user is when they log out.

| Current page/surface | Target after logout | Reason |
| --- | --- | --- |
| Public discovery page (`/`, `/discover`, `/listing/:id`, `/trends/*`) | Stay on same page as anonymous | The page remains useful and shareable. |
| Auth modal opened over public page | Close modal and stay on same page | Avoid unnecessary navigation. |
| User page (`/my-bookings`, `/saved-areas`, `/my-listings`, `/listings/*`) | `/` or `/discover` | Protected user data should disappear. |
| Broker workspace (`/broker/*`) | `/` or `/discover` with signed-out message | Broker workspace is not public. Do not land on `/auth` unless user explicitly chose switch account. |
| Admin console (`/admin/*`) | `/` or dedicated signed-out admin fallback if admin app later splits | Admin data must clear immediately. |
| In-progress listing form with unsaved changes | Confirm before logout | Prevent accidental data loss. |
| Expired session on protected page | Auth modal or `/auth?redirect=<current>` | Let user recover the session. |

Recommended default: after an explicit user-initiated logout from a protected area, send the user to `/discover` or `/` with a small toast:

> You have been signed out.

Do not send normal logout to `/auth` by default. `/auth` means “please sign in”; logout usually means “I am done.”

## Route model impact

### Keep

```text
/auth
/auth/callback
```

### Add or implement

- global auth modal provider
- auth intent store, for example `{ source, redirectTo, action, payload }`
- protected route handling that can open the modal or redirect fallback
- post-auth resolver that chooses whether to resume intent or route by role

### Do not do yet

- remove `/auth`
- make every protected route modal-only
- physically split the admin app

## Expected implementation shape

Conceptual frontend pieces:

```text
AuthModalProvider
useAuthModal()
openAuthModal({ mode, redirectTo, action, payload })
ProtectedRoute
resolvePostLoginDestination(user, pendingIntent)
logout({ returnTo? })
```

The same policy should drive:

- header sign-in button
- save area/listing CTA
- booking CTA
- create listing CTA
- broker/admin protected route recovery
- logout handling

## Testing expectations

- Public page sign-in opens modal and does not navigate away.
- Closing modal returns to unchanged public page.
- Protected route unauthenticated path preserves intended destination.
- Login after save action resumes save.
- Login after create listing CTA continues to listing creation.
- Login from admin URL only lands on admin page for admin role.
- Logout from public route stays public and clears user nav.
- Logout from broker route clears sensitive state and lands on `/` or `/discover`.
- Logout from admin route clears sensitive state and lands safely.
- `/auth` still works as fallback.
- `/auth/callback` still works.

## Open product decisions

1. Should logout from protected routes land on `/` or `/discover`? Recommendation: `/discover` if discovery is the main product surface; `/` if landing page is more polished.
2. Should broker/admin sign-in have separate entry labels, or use the same modal with role-aware post-login routing?
3. Should sign-up include explicit intent selection, such as buyer/owner/broker?
4. Should broker self-signup create `BROKER_PENDING` rather than immediate `BROKER`?
