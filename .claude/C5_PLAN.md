# C5 — Notification Bell: Pre-Implementation Plan

## Goal
Enhance the existing NotificationBell component to meet all C5 acceptance criteria by adding: refetch on dropdown open, error state display in the dropdown, and a comprehensive test suite.

## Current State Assessment

### Already implemented:
- Bell icon with unread badge (99+ overflow) ✅
- Popover dropdown with notification list ✅
- Mark-as-read with optimistic update + rollback ✅
- Load on mount ✅
- Refetch on window focus (React Query default) ✅
- 60s poll for unread count ✅
- Empty state ✅
- Loading state ✅

### Missing:
- Refetch notifications when dropdown opens
- Error state display in dropdown (API errors/404 → subtle message)
- "Mark all as read" → **Skip** (backend has no endpoint; per instructions: do not add new endpoints)
- Frontend test file
- Display count should be 20 (currently 10, prompt says 10–20)

## Approach

1. **EDIT `src/components/notifications/NotificationBell.tsx`**
   - Call `refetch()` when popover opens (`onOpenChange` handler)
   - Add error state UI in dropdown (subtle inline message)
   - Show toast on mark-as-read failure
   - Increase displayed notifications from 10 to 20

2. **NEW `src/components/notifications/__tests__/NotificationBell.test.tsx`**
   - Badge count display (0 = hidden, 1 = shown, 100 = "99+")
   - Optimistic mark-as-read
   - Rollback on error
   - Empty state
   - Error state display
   - Refetch on open

## Files to be changed or created
* `src/components/notifications/NotificationBell.tsx` (EDIT)
* `src/components/notifications/__tests__/NotificationBell.test.tsx` (NEW)

## Scope check
* [x] This task modifies 3 files or fewer (2 files)
* [x] If more than 3 files are required, the task has been stopped and split

## Open questions / assumptions
* **No "mark all as read"**: Backend only has `PUT /api/notifications/{id}/read`. Per instructions, skipping this.
* **Window focus refetch**: React Query defaults `refetchOnWindowFocus: true` — already active with no config changes needed.
* **60s poll**: Already configured for unread count. Notifications list uses `staleTime: 60_000` which is reasonable.
* **Display count**: Increasing from 10 to 20 to match prompt guidance.

## Backend API endpoints (existing, no changes)
```
GET    /api/notifications             → List top 50 for user (desc by createdAt)
GET    /api/notifications/unread-count → { count: number }
PUT    /api/notifications/{id}/read   → 204 No Content (or 404 if not found/not owned)
```

## Key files to reference during implementation
| File | Role |
|------|------|
| `src/components/notifications/NotificationBell.tsx` | Component to edit |
| `src/hooks/useNotifications.ts` | Hooks (useNotifications, useUnreadCount, useMarkAsRead) |
| `src/lib/api.ts` | API wrapper with auto JWT |
| `src/components/layout/AppLayout.tsx` | Already imports NotificationBell at line 168 |
| `src/test/setup.ts` | Test setup (jsdom, matchMedia mock) |
| `src/lib/__tests__/geocode.test.ts` | Reference test pattern |
| `vitest.config.ts` | Test config |

## Git workflow
```bash
# Create worktree
git worktree add ../worktrees/sprint01/c5-notification-bell -b sprint01/c5-notification-bell

# Work in worktree
cd ../worktrees/sprint01/c5-notification-bell

# Run tests
npm test
```

## Status: AWAITING APPROVAL
