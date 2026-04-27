# Current PR Capsule

PR: #847
Title: [E2E] Anonymous vs authenticated gallery behaviour

## Acceptance Criteria — Anonymous
- [ ] AC-A1: imageCount >= 2 listing: first image renders, nav arrows visible
- [ ] AC-A2: Clicking Next triggers lock overlay — image does not advance
- [ ] AC-A3: Lock overlay contains Lock icon and "Sign in to view all photos" text
- [ ] AC-A4: Clicking Prev from locked state dismisses overlay, returns to image 1
- [ ] AC-A5: Thumbnail strip is NOT rendered
- [ ] AC-A6: Image counter reads "1 / N" where N = imageCount from backend

## Acceptance Criteria — Authenticated
- [ ] AC-B1: All images navigable freely — no lock overlay at any index
- [ ] AC-B2: Thumbnail strip renders; clicking a thumbnail updates main image
- [ ] AC-B3: Image counter advances correctly through full set

## Test fixture requirements
- One listing with imageCount >= 2 and at least 2 real image URLs in images[]
- Anonymous session (no cookies / Supabase session)
- Authenticated seed user for auth assertions

## Out of Scope
- Homepage changes
- Backend changes
- Unit tests (already in describe blocks H, I, J)

## Touched Files Hint
- e2e/gallery-behaviour.spec.ts — NEW: anonymous + authenticated gallery E2E spec

Key selectors:
- Nav arrows: getByRole('button', { name: /next image/i }) / /previous image/i
- Lock overlay: getByRole('heading', { name: /sign in to view all photos/i })
- Lock icon: SVG with class lucide-lock
- Image counter: getByText(/^\d+ \/ \d+$/)
- Thumbnail strip: getByRole('tablist') or getByRole('tab')
- Main image: getByRole('img', { name: /property image/i })

Guards required:
- test.skip if listing fixture not LIVE
- test.skip if user creds absent for authenticated block
