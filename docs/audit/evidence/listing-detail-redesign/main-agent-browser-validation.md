# Phase 7A — Main-Agent live browser validation (issue #1797)

**Date:** 2026-07-07
**Route:** http://localhost:5197/listing/e2e00001-0000-0000-0000-000000000004 (verification listing; component is data-driven, not special-cased)
**Stack:** worktree-root Vite (:5197) + Spring backend (:8197) against the **local** ephemeral PostGIS fixture (`pg-test-fixture`, 127.0.0.1:5434, seeded via `scripts/db/restore-test-fixture.sh`). **Zero shared-Supabase access:** backend launched with `SPRING_FLYWAY_ENABLED=false` (fixture already migrated), DB env forced to `localhost:5434`, and the worktree `backend/.env` shared host neutralised (0 `supabase.com`/`pooler` refs). CORS extended to allow `http://localhost:5197`.

## Why this supplements the qa specialist's run
The automated leaf qa specialist could not drive the browser ("Permission denied by user" on every navigate — no human present to grant the Chrome-extension site permission), so it reported `NEEDS_USER_DECISION` with CODE_VERIFIED + API_VERIFIED evidence. The Main Agent (human present in-session) re-ran the live browser pass against the same safe local stack and drove the anon journey directly. Screenshots are rendered inline in the session transcript; the browser MCP `save_to_disk` does not expose retrievable file paths in this harness, so PNGs could not be written into this directory — the per-state observations below are the file-of-record.

## States driven live in the browser (anonymous session)

| # | State | Observed | ACs evidenced |
|---|---|---|---|
| 1 | Full listing detail (desktop, anon) | Trust-first data-driven layout renders: breadcrumb Home/Discover/Manipal/title; gallery ("No images available" — seed imageCount 0) with share/save overlays; right **sticky "Request a viewing time" panel** (no modal); serif title "Independent house in Manipal"; badges "Independent house"/"For sale"; Area Market honest empty state "Not enough data for this area yet." | AC1, AC5, AC10 |
| 2 | Inline panel — date selected | Clicking a quick date chip (Tom 8) highlights it and reveals **"PICK A PREFERRED TIME"** slots (9 AM, 10 AM, 11 AM, 2 PM, 3 PM, 4 PM) inline; helper "Now pick a preferred time." No modal, no double date/time entry. | AC1 |
| 3 | Inline panel — date + time selected | Selecting 10 AM highlights the slot; optional **Message (0/500)** textarea appears; primary CTA becomes **solid copper** "Sign in to request viewing" with copy **"We'll save your pick and take you to sign in — you won't lose your selection."** No name/email/phone PII fields. | AC1, AC4, AC11 |
| 4 | Anon submit → sign-in routing | Clicking the CTA opens the **in-page sign-in modal** (Google / email+password) — same origin, no route change; the Tom 8 + 10 AM selection is preserved behind it. **Network check: zero `/api/bookings` requests fired** on the anon submit (verified via read_network_requests). | AC4 (Option A: no auth broadening, no anon booking POST, intent preserved) |
| 5 | Location & essentials (anon) | Map area renders the **honest static fallback** ("Map view — Manipal") — no Leaflet map, **no POI distance lines, no exact pin** — because #1726 withholds residential coords for the anon/public projection. Real **Nearby schools (7 within 2 km)** with distances (580–730 m) and **Nearby Essentials** with OpenStreetMap attribution. | AC8 (privacy branch: no fabricated POIs/distances, no exact pin) |

## Backend behaviour (live, local backend)
- `GET /api/public/listings/e2e00001-…-0004` → 200 (with `Origin: http://localhost:5197` after CORS fix).
- `GET /api/listings/…/trust` → 200 `{"badges":[]}` (public-safe badge DTO; no raw trustTier; empty because this seeded listing has no granted badges).
- `POST /api/bookings` (no auth) → 401 (backend independently rejects anon booking; defence in depth behind the FE anon path that never calls it).

## Honestly NOT browser-captured this run (remain CODE_VERIFIED / unit-tested)
- **Authenticated submit → inline pending → success state** (AC2): requires a real JWT sign-in; not exercised (I do not enter credentials). Verified in source (`ViewingRequestPanel.tsx` idle→pending→success `role=status` "request, not a confirmed booking" + reset) and by `ViewingRequestPanel.test.tsx` (80/80 changed-area unit suite green).
- **Authenticated coarsened-coords POI *lines* on the map** (AC8 authed branch): requires a JWT session (coarsened, non-null coords) to mount `PoiMiniMap` with the Polyline+distance-label render. Verified in source (`PoiMiniMap.tsx` Polyline + `createDistanceIcon`, gated on `enabled: hasCoords`) and `PoiMiniMap.test.tsx`.
- **Mobile bottom action bar** (AC5): the capture environment would not force the Chrome viewport below the `md` breakpoint (renders stayed at 1457px), so the `md:hidden` bar did not appear. Verified in source (`ListingMobileActionBar.tsx` `md:hidden`, scroll-focuses the shared `#viewing-request-panel`, no duplicate form).

## Verdict
The core issue deliverables — **modal → inline sticky panel**, **date/time inline selection**, **Option A anon routing with intent preservation and no booking POST**, **#1726 privacy-safe map fallback**, and **trust-first data-driven layout** — are **confirmed live in the browser**. The three auth-gated / mobile-viewport states are CODE_VERIFIED + unit-tested. No regression or contradiction with the ACs was observed. Phase 7A → **PASS** (method: BROWSER_VERIFIED for the anon journey + inline panel + privacy fallback; CODE_VERIFIED for authed-only + mobile states).
