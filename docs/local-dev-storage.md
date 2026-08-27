# Local dev photo-upload storage (#2351)

## Problem

Every local worktree backend runs with `supabase.storage.enabled=false` (no `SUPABASE_URL`
/ `SUPABASE_SERVICE_ROLE_KEY` locally — see `backend/src/main/java/.../listing/storage/SupabaseStorageService.java`).
`POST /api/listings/{id}/images/upload-url` always returns `503`, and submit-for-review
requires >=3 real photo rows, so there was no real-UI-only path past the photo gate in local
dev.

## Fix

A filesystem-backed stub (`LocalDevStorageService` + `LocalDevStorageController`) implements
the same signed-upload-URL contract `SupabaseStorageService.createSignedUploadUrl` already
promises, gated by `local.dev.storage.enabled` (env: `LOCAL_DEV_STORAGE_ENABLED`).

- When `supabase.storage.enabled=false` **and** `local.dev.storage.enabled=true`,
  `SupabaseStorageService.createSignedUploadUrl` delegates to the local stub instead of
  returning `Optional.empty()`.
- The stub returns a same-origin PUT URL: `{scheme}://{host}:{port}/api/dev/local-storage/upload/{bucket}/{path}`,
  derived from the current request (not a fixed config value), so it works correctly no matter
  which port a given worktree's backend happens to be running on.
- `LocalDevStorageController` (only mounted when the flag is `true`) accepts the `PUT` and
  writes bytes under `local.dev.storage.root` (default: `${java.io.tmpdir}/udupi-local-storage`),
  and serves them back at `GET /api/dev/local-storage/public/{bucket}/{path}`.
- Path-traversal guarded the same way `SupabaseStorageService` guards its own paths (reject any
  path containing `..`).

**Zero production/CI impact:** the flag defaults to `false` everywhere, including the shared
local `backend/.env` (never set there — see Setup below). When `false`,
`LocalDevStorageController` mounts no routes (`@ConditionalOnProperty`) and
`createSignedUploadUrl` behaves exactly as before (`Optional.empty()` → `503`).

## Setup

`backend/.env` is symlinked from the main checkout into every worktree by
`scripts/dev-worktree-stack.sh` — it is genuinely shared state across concurrently-running
worktrees. To keep this fix isolated to whichever worktree opts in (and not silently change
behaviour for sibling worktree stacks mid-review), `LOCAL_DEV_STORAGE_ENABLED` is deliberately
**not** set in that shared file. Opt in per invocation instead, identically in any worktree:

```bash
LOCAL_DEV_STORAGE_ENABLED=true scripts/dev-worktree-stack.sh \
  --worktree <path> --frontend-port <n> --backend-port <n>
```

(or `export LOCAL_DEV_STORAGE_ENABLED=true` before running `backend/run-local.sh` directly).
Spring Boot picks up process environment variables the same way it picks up ones sourced from
`backend/.env`, so this is a one-line, copy-pasteable, worktree-agnostic instruction — no code
or shared-file change needed to reproduce it elsewhere.

## Image display — backend-owned URL resolution

The frontend (`src/hooks/useListingImages.ts`, unmodified) still computes and sends a
Supabase-style `url` when it calls `POST /api/listings/{id}/images` — that value is only ever
used to seed the client-supplied field and is never trusted by the server as the display URL.

`ListingImageController.toResponse(img, localDevStorageService)` resolves the actual display
URL server-side on every response that returns image rows (register, list, reorder):

- When `local.dev.storage.enabled=true`, the URL is derived from the image's own
  `storagePath` via `LocalDevStorageService.getPublicUrl(bucket, storagePath)` — a same-origin
  GET URL served by `LocalDevStorageController#serve` — regardless of what the client sent at
  registration time.
- When disabled (prod/CI), `toResponse` is an exact pass-through of the stored `img.getUrl()` —
  no semantic change from before this fix.

This means locally-stored images register successfully (satisfying the >=3-photo submit gate)
**and** render correctly in an `<img>` tag in local dev, completing the full
create → submit → approve → LIVE journey with real, visible photos — no frontend change
required, since the override happens entirely in the response-serialization layer.
