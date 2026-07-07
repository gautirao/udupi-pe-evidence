# Frontend behaviour

## Hook — src/hooks/useSavedListings.ts (mirrors useSavedAreas / useNotifications)
- `useSavedListingIds()` — GET `/api/me/saved-listings/ids`, `enabled: isAuthenticated`, auth-scoped React Query key, exposes an id `Set` for O(1) membership.
- `useSavedListings()` — GET `/api/me/saved-listings` for the saved-homes page.
- `useSaveListing()` / `useUnsaveListing()` — POST/DELETE mutations with optimistic update (`onMutate`), rollback (`onError`), invalidate (`onSettled`). POST 200 and 201 both success; DELETE 204/absent success. A 401 surfaces a "Sign in required" toast (not swallowed).
- Keys nested under the existing `['listing', ...]` prefix so the existing `useAuthCacheSync` invalidates them on sign-in/out — no competing mechanism.

## PropertyCard — src/components/discover/PropertyCard.tsx
- `isSaved = savedIds.has(listing.id)` (server-backed; replaced the old local `useState(false)`).
- onClick keeps `e.stopPropagation()` (no card navigation). If not authenticated → `openAuthModal()` + return (no API, no local toggle). If authenticated → optimistic save/unsave.
- `disabled` while a mutation is in flight (no double-submit). Preserves `data-testid="listing-save-button"`, `aria-label` ('Save property' / 'Remove saved property'), `aria-pressed`, keyboard operability.
- Save affordance exists ONLY in PropertyCard (grep of `data-testid="listing-save-button"` + "visual-only" comment) — agri/school bespoke cards untouched.

## Saved-homes page — src/pages/SavedHomes.tsx
- Route `/saved-homes` behind `ProtectedRoute` (App.tsx); nav link added in the existing "Saved" slot (AppLayout.tsx, desktop + mobile).
- Reuses the SavedAreas page shell + existing card components (no new design language).
- States: loading (skeleton), error (retry), empty ("No saved homes yet." + link to `/discover`), success (cards + remove action). `available=false` badged "No longer available".

## Tests
useSavedListings.test (14), PropertyCard.test (+8 new, 84 total preserved), SavedHomes.test (7), AppLayout.test (20), listingQueryKeys.test (6) — all pass.
