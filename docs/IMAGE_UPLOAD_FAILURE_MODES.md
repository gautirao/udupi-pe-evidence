# Image Upload Failure Modes & Rollback Policy

**Status**: Authoritative policy for B5 and all future media handling.
**Last updated**: 2026-02-12
**Applies to**: `listing_images` table, Supabase Storage bucket `listing-images`.

---

## 1. Core Principles

1. **DB is source of truth.** A listing image exists if and only if a row exists in `listing_images`.
2. **Storage objects may temporarily exist without DB rows.** This is acceptable and expected during normal upload flow.
3. **All operations must be idempotent.** Retrying any operation must not produce duplicate rows or errors.
4. **No distributed transactions.** Storage and DB are separate systems. We never attempt atomic operations across both.

---

## 2. Upload Flow

### Sequence

```
Client                    Supabase Storage              Backend DB
  │                            │                            │
  ├── PUT object ─────────────►│                            │
  │◄── 200 OK ────────────────┤                            │
  │                            │                            │
  ├── POST /api/listings/{id}/images ──────────────────────►│
  │   { storagePath, url }     │                            │
  │◄── 201 Created ───────────────────────────────────────┤│
```

### Rules

- Client uploads bytes to Storage **first**.
- Client calls backend metadata endpoint **only after** successful upload.
- Backend validates before inserting:

| Check | Error |
|-------|-------|
| Listing exists and caller owns it (or admin) | 404 |
| Status in {DRAFT, REJECTED} | 400 |
| Image count < 10 for this listing | 400 |
| `storagePath` starts with `listings/{createdBy}/{listingId}/` | 400 |
| File extension in {jpg, jpeg, png, webp} (case-insensitive) | 400 |
| `storagePath` not already registered (UNIQUE constraint) | 409 |

### Failure scenarios

| Failure point | State after failure | Recovery |
|---------------|-------------------|----------|
| Storage upload fails | No Storage object, no DB row | Client retries upload |
| Storage succeeds, metadata call fails (network) | Orphan in Storage, no DB row | Client retries metadata call (idempotent via UNIQUE on storage_path) |
| Storage succeeds, metadata returns 400/404 | Orphan in Storage, no DB row | Client should attempt best-effort `DELETE` on Storage object. If that also fails, orphan remains until cleanup. |
| Storage succeeds, metadata returns 409 (duplicate) | Row already exists, object already in Storage | No action needed — idempotent success |

### Idempotency mechanism

The `listing_images` table must have a UNIQUE constraint on `(listing_id, storage_path)`. If a row with the same path already exists, backend returns 409 Conflict. Client treats 409 as success (image already registered).

> **Migration note**: V9 does not include this UNIQUE constraint. A V12 migration must add it before B5 ships.

---

## 3. Delete Flow

### Sequence

```
Client                    Backend DB                Supabase Storage
  │                            │                            │
  ├── DELETE /api/listings/{id}/images/{imageId} ──────────►│
  │                            ├── DELETE row               │
  │                            ├── (optional) DELETE object ─►│
  │◄── 204 No Content ────────┤                            │
```

### Rules

1. **Delete DB row first.** This immediately makes the image invisible (DB is source of truth).
2. **Attempt Storage delete second.** This is best-effort.
3. **Storage delete failure is non-fatal.** Log a warning; do not fail the HTTP response.
4. If the image row does not exist or does not belong to the listing → 404.
5. If listing status is not in {DRAFT, REJECTED} → 400.

### Failure scenarios

| Failure point | State after failure | Recovery |
|---------------|-------------------|----------|
| DB delete succeeds, Storage delete fails | Orphan in Storage, no DB row | Orphan cleanup (section 5) |
| DB delete fails (row not found) | No change | Client receives 404 |

### Idempotency

Deleting an already-deleted image returns 404 (row gone). This is acceptable — the client's intent (image removed) is satisfied.

---

## 4. Reorder Flow

### Rules

- DB-only operation. No Storage interaction.
- Transactional: all position updates succeed or none do.
- Request body contains the complete ordered list of image IDs for the listing.
- Backend validates: all IDs belong to the listing, no duplicates, no missing IDs.
- Positions assigned as: `imageIds[0] → 0`, `imageIds[1] → 1`, etc.

### Idempotency

Sending the same order twice produces the same result. No side effects.

### Failure scenarios

| Failure point | State after failure | Recovery |
|---------------|-------------------|----------|
| Validation fails (missing/extra IDs) | No change | Client fixes request |
| Transaction fails (DB error) | No change (rolled back) | Client retries |

---

## 5. Orphan Cleanup Strategy

### Definitions

| Term | Definition |
|------|-----------|
| **Orphan storage object** | A file in Supabase Storage bucket `listing-images` with no corresponding `listing_images` row. |
| **Dangling DB row** | A `listing_images` row where the `storage_path` no longer exists in Storage. Unlikely (Storage rarely loses objects) but possible if manual deletion occurs. |

### When orphans are created

- Upload succeeds but metadata call fails and client doesn't clean up.
- Delete flow: DB row removed but Storage delete fails.
- Manual Storage manipulation outside the application.

### Cleanup approaches

**Automated (future)**:
- Scheduled job lists Storage objects under `listing-images/listings/`.
- For each object, check if a `listing_images` row exists with matching `storage_path`.
- If no row exists and the object is older than 24 hours → delete from Storage.
- The 24-hour grace period prevents deleting objects mid-upload.

**Manual (current — via A4 dev cleanup tooling)**:
```sql
-- Find orphan candidates: storage paths in listing_images with no matching listing
SELECT li.id, li.storage_path, li.listing_id
FROM listing_images li
LEFT JOIN property_listings pl ON li.listing_id = pl.id
WHERE pl.id IS NULL;

-- Delete dangling rows (listing was deleted, CASCADE should handle this,
-- but run as safety check):
DELETE FROM listing_images
WHERE listing_id NOT IN (SELECT id FROM property_listings);
```

For Storage orphans, use the Supabase dashboard or CLI:
```bash
# List objects in bucket
supabase storage ls listing-images/listings/

# Cross-reference with DB
psql -c "SELECT storage_path FROM listing_images" | sort > db_paths.txt
# Compare with storage listing to find orphans
```

### Dangling DB row recovery

If a `listing_images` row references a non-existent Storage object:
- The URL will return 404 to the frontend.
- Frontend should handle missing images gracefully (placeholder).
- Developer can delete the dangling row manually or via cleanup script.

---

## 6. Observability

### Required log fields

Every image operation must log:

| Field | Example |
|-------|---------|
| `userId` | `550e8400-...` |
| `listingId` | `6ba7b810-...` |
| `storagePath` | `listings/.../photo1.jpg` |
| `action` | `image_register`, `image_delete`, `image_reorder` |
| `error` (on failure) | `Max 10 images exceeded` |

### Log format

```
INFO  POST /api/listings/{listingId}/images -> 201 storagePath=... userId=...
WARN  Storage delete failed listingId={} storagePath={} error={}
INFO  DELETE /api/listings/{listingId}/images/{imageId} -> 204 userId=...
INFO  PUT /api/listings/{listingId}/images/reorder -> 200 count=5 userId=...
```

### Error code consistency

| Scenario | HTTP Status |
|----------|-------------|
| Listing not found or not owned | 404 |
| Wrong listing status | 400 |
| Max images exceeded | 400 |
| Invalid storage path or extension | 400 |
| Duplicate storage_path (idempotent) | 409 |
| Reorder with wrong image IDs | 400 |
| Image not found or not in listing | 404 |

---

## 7. Migration Requirement

Before B5 ships, add migration:

```sql
-- V12: Add unique constraint for upload idempotency
ALTER TABLE public.listing_images
    ADD CONSTRAINT uq_listing_images_listing_path
    UNIQUE (listing_id, storage_path);
```

This enforces idempotency at the DB level and prevents duplicate metadata rows.
