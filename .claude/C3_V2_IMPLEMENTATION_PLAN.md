# C3 v2 — Image Uploader Hardening Plan

**Status**: Awaiting approval
**Branch**: TBD (new branch from main, worktree at `../worktrees/<branch>`)
**Parent PR**: #15 (merged)

---

## Goal

Harden the existing C3 image uploader (merged in PR #15) with three specific gaps:

1. **Retry finalize** — When storage upload succeeds but metadata registration fails, preserve the uploaded storage path and show a "Retry finalize" button instead of deleting the orphan and forcing re-upload.
2. **Retry upload** — When storage upload fails, show a "Retry" button per file (currently shows "Failed" with no action).
3. **Test file** — Add a Vitest test covering min-count gating, retry-upload, and retry-finalize flows.

---

## File Plan (3 files)

### File 1 — EDIT `src/hooks/useListingImages.ts`

Changes:
- Add `finalize_failed` status to `UploadProgress` (distinct from generic `error`).
- When metadata POST returns non-409 error, keep `storagePath`/`url` in state instead of deleting the orphan.
- Store the `File` reference in upload state so retries can re-use it.
- Add `retryFinalize(uploadKey)` — retries only the metadata POST using stored `storagePath` and `url`.
- Add `retryUpload(uploadKey)` — retries the full upload using stored `File` reference.
- Stop deleting storage objects on 400/404 (orphan cleanup strategy from IMAGE_UPLOAD_FAILURE_MODES.md section 5 handles eventual cleanup).
- Expose `retryFinalize`, `retryUpload`, and `dismissUpload` from the hook.

Detailed UploadProgress type change:
```ts
interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'registering' | 'done' | 'error' | 'finalize_failed';
  error?: string;
  // NEW: retained for retry flows
  file?: File;           // kept for retryUpload
  storagePath?: string;  // kept for retryFinalize
  url?: string;          // kept for retryFinalize
}
```

Key behavioral change in `uploadImage`:
- On storage failure → status `'error'`, keep `file` in state for retry.
- On metadata failure (non-409) → status `'finalize_failed'`, keep `storagePath` + `url` in state, do NOT delete from storage.
- On 409 → treat as success (unchanged).

New callbacks:
```ts
retryUpload(uploadKey: string)   // re-runs full upload flow using stored File
retryFinalize(uploadKey: string) // re-runs only metadata POST using stored storagePath/url
dismissUpload(uploadKey: string) // removes entry from uploads state
```

### File 2 — EDIT `src/components/dealer/ImageUploader.tsx`

Changes to the upload progress row:
- When `status === 'error'`: show "Retry" button that calls `retryUpload(key)`.
- When `status === 'finalize_failed'`: show "Retry finalize" button that calls `retryFinalize(key)`.
- Both states also show a dismiss "X" button that calls `dismissUpload(key)`.

New props destructured from hook:
```ts
const { ..., retryUpload, retryFinalize, dismissUpload } = useListingImages(listingId);
```

Upload progress row rendering (pseudocode):
```tsx
{upload.status === 'error' && (
  <>
    <span className="text-destructive">Upload failed</span>
    <Button size="sm" onClick={() => retryUpload(key)}>Retry</Button>
    <Button size="icon" variant="ghost" onClick={() => dismissUpload(key)}>
      <X />
    </Button>
  </>
)}
{upload.status === 'finalize_failed' && (
  <>
    <span className="text-destructive">Finalize failed</span>
    <Button size="sm" onClick={() => retryFinalize(key)}>Retry finalize</Button>
    <Button size="icon" variant="ghost" onClick={() => dismissUpload(key)}>
      <X />
    </Button>
  </>
)}
```

### File 3 — NEW `src/hooks/__tests__/useListingImages.test.ts`

Test cases:

1. **canSubmit gating**:
   - Mock API to return 2 images → `canSubmit` is `false`
   - Mock API to return 3 images → `canSubmit` is `true`

2. **Retry upload flow**:
   - Mock `supabase.storage.upload` to fail
   - Verify upload entry has `status: 'error'` and `file` is retained
   - Call `retryUpload(key)`
   - Mock storage to succeed this time + mock metadata POST
   - Verify upload completes

3. **Retry finalize flow**:
   - Mock storage upload to succeed
   - Mock metadata POST to fail with 400
   - Verify upload entry has `status: 'finalize_failed'`, `storagePath` and `url` retained
   - Verify storage object was NOT deleted
   - Call `retryFinalize(key)`
   - Mock metadata POST to succeed
   - Verify upload completes

4. **409 idempotency**:
   - Mock storage upload to succeed
   - Mock metadata POST to return 409
   - Verify treated as success (status: 'done')

Test infrastructure:
- Use `vi.mock` for `@/integrations/supabase/client` and `@/lib/api`
- Use `@tanstack/react-query` `QueryClientProvider` wrapper for `renderHook`
- Use `vi.mock` for `@/hooks/use-toast`

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Keep existing file paths | `src/hooks/` + `src/components/dealer/` | Prompt suggested `src/features/` but project convention is different |
| Don't delete orphan on 400/404 | Keep in storage for retry | Prompt requires "retry finalize without re-upload"; section 5 orphan cleanup handles eventual cleanup |
| Store `File` in state | Enables retry-upload without re-selecting | Per prompt: "allow retry" for upload failures |
| No form-state data shape change | Backend owns metadata shape | The `storage_bucket`, `content_type`, `width`, `height` fields from the prompt are backend concerns; frontend sends `storagePath` + `url` |
| No listing form integration | Edit page doesn't exist yet | Create page saves draft first, navigates to edit; images are edit-page concern |

---

## Risks / What Could Break

- **Memory**: Storing `File` objects in React state for retry. Files are references (not copies), so memory impact is minimal. Cleared on success or dismiss.
- **Orphan accumulation**: No longer deleting orphans on 400/404. Acceptable per IMAGE_UPLOAD_FAILURE_MODES.md section 5 (24-hour grace period cleanup).
- **Test mocking complexity**: Mocking both Supabase client and API module. Follow pattern from existing `geocode.test.ts`.

---

## Execution Steps

1. Create worktree: `git worktree add -b sprint01/c3-image-uploader-v2 ../worktrees/sprint01-c3-image-uploader-v2 main`
2. Edit `src/hooks/useListingImages.ts`
3. Edit `src/components/dealer/ImageUploader.tsx`
4. Create `src/hooks/__tests__/useListingImages.test.ts`
5. Run `npm run build` (verify compilation)
6. Run `npx vitest run` (verify tests pass)
7. Commit, rebase, push, PR, merge
