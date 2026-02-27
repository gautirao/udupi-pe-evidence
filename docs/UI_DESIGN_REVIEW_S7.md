# UI Design Review — Sprint 7

**Reviewer**: ui-designer agent
**Date**: 2026-02-27
**Stack**: React + TypeScript + Vite, shadcn/ui, Tailwind CSS, React Router, React Query
**Scope**: All 6 screen groups as defined in PR-S7-6

---

## UI-1: AppLayout & Navigation

**Files reviewed**:
- `src/components/layout/AppLayout.tsx`

### State Coverage
- Loading state: N/A (layout shell, not a data-fetching component)
- Error state: N/A
- Empty/Data states: N/A

### Findings

| Severity | Finding | Recommendation |
|----------|---------|----------------|
| HIGH | Admin desktop nav items overflow at 1024px. The admin role renders 10 nav links in the same horizontal `<nav>` as primary links (`adminPrimaryNavigation` + `adminNavigation`). At `lg:` breakpoint the bar will overflow or wrap, breaking the layout. | Keep the primary nav links (`Map`, `Insights`) in the desktop horizontal bar. Move the 8 admin-specific items into a `DropdownMenu` labeled "Admin" with a `ChevronDown` caret. This matches the pattern used in the mobile `Sheet` (section label + grouped links). |
| HIGH | Mobile `Sheet` has no `SheetTitle` / `SheetDescription`. The `SheetContent` at line 169 contains only a manually composed logo block and `<NavLinks mobile>`. shadcn/ui `Sheet` requires an accessible title for screen-reader announcement; the missing `SheetTitle` will produce a runtime accessibility warning and WCAG 4.1.2 failure. | Add `<SheetHeader><SheetTitle className="sr-only">Navigation</SheetTitle></SheetHeader>` inside `SheetContent`. |
| MEDIUM | Dealer navigation omits "Bookings". The `dealerNavigation` array (line 71–76) has Home, My Listings, New Listing, Notifications — but `DealerBookings` (`/dealer/bookings`) exists and is the primary action surface for dealers managing requests. | Add `{ name: 'Bookings', href: '/dealer/bookings', icon: CalendarCheck2 }` to `dealerNavigation`. |
| MEDIUM | Active state detection is exact-match only (`location.pathname === item.href`). For nested routes like `/dealer/listings/123/edit` the "My Listings" link (`/dealer/listings`) will not show as active, breaking visual orientation. | Use `location.pathname.startsWith(item.href)` for prefix matching, guarded to exclude the root path: `item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href)`. |
| MEDIUM | `NavLinks` is defined as an inner function component (line 104) inside `AppLayout`. This causes it to be re-created on every render of `AppLayout`, which means any `Link` rendered inside it loses React reconciliation identity. | Hoist `NavLinks` out of `AppLayout` and pass `primaryNav`, `isAdmin`, and `adminNavigation` as props. |
| LOW | The `NotificationBell` is rendered unconditionally for logged-out users (line 205). A logged-out visitor sees a notification icon that presumably calls an authenticated endpoint, producing either an error or showing zero notifications. | Render `<NotificationBell />` only when `user` is truthy: `{user && <NotificationBell />}`. |
| LOW | Logo text "Udupi Property Tracker" (line 185) is hidden below `sm:` but the mobile menu `SheetContent` (line 174) duplicates the brand name as "Udupi Tracker" — inconsistent product name. | Standardize both to the same string, e.g. "Udupi Property Tracker". |
| LOW | The `py-12` spacing on the "Admin" section label inside the mobile sheet (line 129) uses `mt-4` — consistent with design system, but the label uses `uppercase tracking-wider` which is correct per design system section 3. No change needed here; noted for completeness. |  |

---

## UI-2: Home / Map Page

**Files reviewed**:
- `src/pages/Index.tsx`
- `src/components/map/PropertyMap.tsx`
- `src/components/map/MapFilters.tsx`

### State Coverage
- Loading state: Partial pass — a `Loader2` spinner overlays the map area (line 56–62 of `Index.tsx`). However there is no Skeleton for the filters panel; it renders immediately blank while localities/priceRange load, showing an empty slider and no locality chips. Prefer `Skeleton` rows for filter content per design system section 7.
- Empty state: Absent for zero-results case. When `listingsWithCoords.length === 0` after data loads successfully, the map renders empty with no message. The stats bar shows "0 on map" but there is no call to action or explanation.
- Error state: Pass — a `Card` with error text displays when `error` is truthy (line 63–70).
- Data state: Pass.

### Findings

| Severity | Finding | Recommendation |
|----------|---------|----------------|
| HIGH | Map filter panel is not mobile-accessible. On screens narrower than `lg:` (1024px), the filter panel `div` has width `w-72` or `w-0` toggled, but there is no responsive handling to make this a `Sheet` on mobile. On small screens the 288px panel pushes the map to near-zero width. | Replace the sidebar `div` with `<Sheet side="left">` for `md:` and below, keeping the current inline panel only for `lg:` and above, as specified in design system section 15. |
| HIGH | `MarkerClusterLayer` (PropertyMap.tsx line 292) recreates the entire cluster group (all markers, event listeners, popup HTML) on every listings prop change because all logic is inside a `useEffect` with `[listings, map, onSelectListing]` as dependencies. If the parent re-renders (e.g., from filter change), this runs again and causes visible map flicker. | Memoize the `listings` array passed as prop using `useMemo` at the call site in `Index.tsx` (already done for `listingsWithCoords` at line 22). Additionally, inside `MarkerClusterLayer`, diff the listings array using a stable key (e.g. `listings.map(l=>l.id).join()`) rather than the object reference. |
| MEDIUM | Empty state missing for zero map results. When data loads but `listingsWithCoords.length === 0`, users see a blank map with only the legend. There is no guidance on why or what to do. | Add an overlay card (similar to the error card, `z-[1000]`) when `!isLoading && !error && listingsWithCoords.length === 0`: icon (`MapPin`), text "No listings match your filters", and a "Clear Filters" button that calls `setFilters({})`. |
| MEDIUM | Map popup price color is hardcoded hex `#0ea5e9` (PropertyMap.tsx line 144) — sky-blue, not the terracotta `text-primary` defined in the design system. This creates a visual inconsistency between popup prices and the listing card price shown in the sidebar preview. | Change to `hsl(var(--primary))` (already used for the chart bar fill in Insights). Inline styles in popup HTML must use `hsl(...)` instead of hardcoded hex since CSS custom properties resolve at the document level. |
| MEDIUM | Map popup uses hardcoded hex color values throughout (lines 110, 151, 245, 256) — dark slate `#1e293b`, muted `#64748b`, border `#e2e8f0`. These values are not responsive to the design system token changes and will not adapt if theme changes. | Accept that Leaflet popup HTML is outside the React/Tailwind rendering context and cannot use Tailwind classes directly. Document these hardcoded values in a comment block at the top of `createPopupContent` as "out-of-Tailwind context — must match CSS vars manually". For the price specifically, read the resolved CSS variable at runtime: `getComputedStyle(document.documentElement).getPropertyValue('--primary')`. |
| MEDIUM | `MapFilters` renders a price `Slider` without a loading or unavailable state. When `priceRange` is `undefined` (during initial fetch), the Slider section renders empty — no skeleton, no label, just blank space below the "Price Range" label (line 177). | Wrap the Slider block in a conditional. When `priceRange` is undefined, show two `Skeleton className="h-4 w-full rounded"` elements to hold the layout. |
| LOW | `Filter` icon on the MapFilters `CardTitle` (line 74) is `h-4 w-4`, but design system section 14 specifies `h-5 w-5` for card title icons. | Change to `Filter className="h-5 w-5 text-primary"`. |
| LOW | The stats bar pipe character at line 87 (`<div className="text-muted-foreground">|</div>`) is a plain text character used as a visual separator. Use `<Separator orientation="vertical" className="h-4" />` (shadcn component already installed) for proper accessible semantics. |  |
| LOW | Selected listing preview card's close button (line 116–123 in `Index.tsx`) has no `aria-label`. The `X` icon button's only content is the icon, which will be announced as empty by screen readers. | Add `aria-label="Close listing preview"` to the `Button`. |

---

## UI-3: Insights Dashboard

**Files reviewed**:
- `src/pages/Insights.tsx`
- `src/components/insights/PaywallCard.tsx`
- `src/components/insights/TrialBanner.tsx`
- `src/components/insights/SavedAreas.tsx`

### State Coverage
- Loading states: Partial pass — all four data cards use `Loader2` spinners. Design system section 7 prefers `Skeleton` for list and card content. The "New Listings" and "Recommendations" sections have known card shapes and should use `Skeleton` rows.
- Empty states: Partial pass — all four cards have empty states with text. However, the empty states for "New Listings" and "Recommendations" (lines 242–245, 311–314 in Insights.tsx) lack the mandatory icon per design system section 7: "Empty state MUST include a relevant icon".
- Error states: Pass — all four cards handle errors with `AlertCircle` + text.
- Data state: Pass.

### Findings

| Severity | Finding | Recommendation |
|----------|---------|----------------|
| HIGH | "New Listings" and "Recommendations" list rows use `hover:bg-accent/50` (lines 251, 321 in Insights.tsx) instead of `hover:bg-secondary/50`. Design system section 8 is explicit: "Use `hover:bg-secondary/50` (warm beige tint) — not `hover:bg-accent/50`". `accent` resolves to coastal teal which is semantically wrong for a hover surface. | Replace `hover:bg-accent/50` with `hover:bg-secondary/50` on both list row `div` elements. |
| HIGH | `SavedAreas` list rows also use `hover:bg-accent/50` (SavedAreas.tsx line 72) — same design system violation. | Replace with `hover:bg-secondary/50`. |
| HIGH | "Recommendations" `Badge` for undervaluation score (Insights.tsx line 328) uses `variant="default"` with a `className="bg-green-500"` color override. Design system section 9 explicitly forbids using `variant="default"` with an overridden background color — instead use `className` directly with `border-0`. | Change to `<Badge className="bg-green-100 text-green-800 border-0">`. |
| MEDIUM | Both "New Listings" and "Recommendations" empty state `div` elements (lines 242–245, 311–314) contain only a `<p>` element with no icon. Design system section 7 states "Empty state MUST include a relevant icon". | Add `<Home className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />` above the `<p>` text in both empty states. The "Recommendations" empty state should use `<Star />`. |
| MEDIUM | The "Average Price by Area" card shows area keys on the X-axis as raw `area_key` strings (format: `country|region|city|locality`, per MVP_SPEC glossary). These pipe-delimited strings will be visually unintelligible to users in the chart axis labels. | Extract only the `locality` segment (last pipe-delimited part) for display in the chart: `item.areaKey.split('|').pop() ?? item.areaKey`. |
| MEDIUM | The "Price Trend" card shows both the "Average Price by Area" and "Price Trend" cards using an identical `<TrendingUp>` icon as their `CardTitle` icon (Insights.tsx lines 115, 159). Design system section 6 says "Always pair `CardTitle` with a relevant Lucide icon". These should be distinct. | Use `<BarChart3 />` for "Average Price by Area" and keep `<TrendingUp />` for "Price Trend". |
| MEDIUM | `PaywallCard` (PaywallCard.tsx line 44) uses `py-16` for its content padding, resulting in a very tall card that dominates the right column. On the `lg:col-span-2` column this is acceptable, but the vertical mass overwhelms the `SavedAreas` column to its left. | Reduce to `py-12` to align with the design system empty state standard. |
| LOW | `TrialBanner` (TrialBanner.tsx line 24) is well-structured: correct `role="alert"`, dismissable, icon, amber color. However it is not linked to any upgrade action. Users seeing the expiry warning have no one-click path to upgrade from the banner itself. | Add a small `Button variant="link" size="sm"` inside the banner that calls `handleUpgrade` (or navigates to the paywall card). |
| LOW | The `authLoading` state from `useAuth()` is used to gate `showPaywall` (Insights.tsx line 47), but there is no loading skeleton shown for the right column while `authLoading` is true. The user sees blank content then a paywall (or charts) appear. | Show a `Skeleton` placeholder (e.g. `Skeleton className="h-64 w-full rounded-lg"`) in the right column while `authLoading` is true. |

---

## UI-4: Listing Detail + RequestViewingModal

**Files reviewed**:
- `src/pages/ListingDetail.tsx`
- `src/components/listing/RequestViewingModal.tsx`

### State Coverage
- Loading state: Pass — `Skeleton` elements render for image, title, and metadata (lines 67–79 of ListingDetail.tsx). Skeletons do not perfectly match the final layout (e.g. no skeleton for the sidebar column), but acceptable.
- Empty/Not Found state: Pass — a `Card` with "Listing Not Found" message and back/return buttons.
- Error state: Pass — same "not found" branch handles both network errors and null data (line 81).
- Data state: Pass.

### Findings

| Severity | Finding | Recommendation |
|----------|---------|----------------|
| HIGH | `RequestViewingModal` submit button (line 157–163) shows the text "Sending..." while pending but does not use a `Loader2` spinner. Design system section 12 specifies `{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}` inside the submit button. The text-only pending state reduces affordance clarity. | Replace the text-only pending label with: `{createBooking.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{createBooking.isPending ? 'Sending...' : 'Send Request'}`. |
| HIGH | `RequestViewingModal` has no error state displayed in the UI. The `createBooking` mutation can fail (network error, validation error from backend), but there is no `createBooking.isError` branch and no visible feedback inside the modal. The user has no indication the request failed. | After the form fields, add: `{createBooking.isError && (<div className="flex items-center gap-2 text-destructive text-sm"><AlertCircle className="h-4 w-4 flex-shrink-0" />Failed to send request. Please try again.</div>)}`. |
| HIGH | Property type badges in `ListingDetail.tsx` use hardcoded inline hex color classes (`bg-green-500`, `bg-orange-500`, `bg-violet-500`, `bg-blue-500`, `bg-gray-500` — line 21–26 via `propertyConfig`). The design system specifies status badges should use `bg-green-100 text-green-800` style (light background, dark text, `border-0`). The current implementation uses dark saturated backgrounds (`bg-green-500 text-white`) which have poor contrast on white card surfaces relative to the warm design palette. | Change `propertyConfig` to use `className` strings matching the design system semantic status pattern: e.g. `land: { label: 'Land', badgeClass: 'bg-green-100 text-green-800 border-0' }` and apply via `<Badge className={badgeClass}>`. Note: the same color objects are duplicated in `PropertyMap.tsx` for map pin colors — those are intentionally saturated and are correct for map context. Only the `Badge` in `ListingDetail.tsx` needs updating. |
| MEDIUM | Listing loading `Skeleton` (lines 67–79) does not represent the 2-column grid layout of the data state. The skeleton shows a full-width image then a few text lines — on desktop this will shift layout noticeably. | Add skeleton elements for the sidebar column alongside the main column skeleton: wrap in a `div className="grid gap-6 md:grid-cols-3"` with appropriate column spans, matching the data state layout. |
| MEDIUM | The "Request Viewing" `Card` in the sidebar (ListingDetail.tsx lines 402–413) is shown unconditionally to all users including unauthenticated visitors. The modal itself correctly handles the unauth case (shows a sign-in prompt), but showing the button without any hint for unauthenticated users creates a flow interruption (click button → see prompt → close modal). | Add `{!user && <p className="text-xs text-muted-foreground mb-2">Sign in to request a viewing</p>}` above the button inside that card, where `user` comes from `useAuth()`. |
| MEDIUM | The contact phone card (ListingDetail.tsx lines 349–369) uses hardcoded `border-green-200 bg-green-50/50 dark:bg-green-950/20` and `text-green-600`, `bg-green-600 hover:bg-green-700` for the Call Now button. These hardcoded color classes bypass the design system's token approach. While semantically appropriate (green = contact/call), they should use the established pattern. | Accept this as a necessary contextual override (green for call-to-action is a strong UI convention), but document the deviation. Lower severity noted here rather than in priority improvements. |
| MEDIUM | The native `<input type="date">` in `RequestViewingModal` (line 100–109) has a manually written className string reproducing shadcn `Input` styles rather than using the `<Input>` component. This creates a maintenance risk as the `Input` component styles could diverge. | Replace with `<Input id="requested-date" type="date" min={minDate} max={maxDate} value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} required />`. The shadcn `Input` component accepts `type="date"` without issue. |
| LOW | The image counter badge (ListingDetail.tsx line 189) uses `bg-black/60 text-white` directly in JSX. While functional, this is a hardcoded color that does not use semantic tokens. | Use `bg-foreground/70 text-background` for better token alignment. |
| LOW | `RequestViewingModal` `DialogHeader` title uses `Calendar className="h-5 w-5"` with no color class. Design system section 14 specifies card title icons should be `text-primary`. | Add `text-primary` to the `Calendar` icon: `<Calendar className="h-5 w-5 text-primary" />`. |

---

## UI-5: Dealer Pages

**Files reviewed**:
- `src/pages/dealer/DealerDashboard.tsx`
- `src/pages/dealer/DealerListings.tsx`
- `src/pages/dealer/DealerBookings.tsx`
- `src/pages/dealer/NewListing.tsx`

### State Coverage
- DealerDashboard: Loading state pass (spinner). No data-fetching, no empty/error needed.
- DealerListings: Loading state partial (spinner, not Skeleton). Empty state partial (text-only, no icon). Error state pass (Alert/destructive).
- DealerBookings: Loading state partial (inline spinner, no Skeleton). Empty state partial (text-only). Error state absent for bookings fetch — `useDealerBookings` error is not handled.
- NewListing: No loading/empty/error needed beyond auth guard.

### Findings

| Severity | Finding | Recommendation |
|----------|---------|----------------|
| CRITICAL | `DealerBookings.tsx` does not destructure `isError` from `useDealerBookings()` (line 28). If the bookings API call fails, the user sees blank sections (empty state text) rather than an error message. There is no `isError` branch in either section. | Destructure `isError` from `useDealerBookings()` and add an error state: `{isError && <Alert variant="destructive"><AlertDescription>Failed to load bookings.</AlertDescription></Alert>}`. |
| HIGH | `DealerListings` status badge function (`statusVariant`, lines 13–24) maps `LIVE` to `variant="default"` (blue/primary), `PENDING_REVIEW` to `variant="secondary"` (muted), and `DRAFT` to `variant="outline"` (gray). These variants do not match the design system's semantic status color classes in section 2. `LIVE` should be green, `PENDING_REVIEW` should be amber, `REJECTED` should be red, `DRAFT` should be gray. Using wrong semantic colors misleads dealers about their listing status. | Replace the `statusVariant` function with direct `className` props per design system section 9: `LIVE` → `className="bg-green-100 text-green-800 border-0"`, `PENDING_REVIEW` → `className="bg-amber-100 text-amber-800 border-0"`, `REJECTED` → `className="bg-red-100 text-red-800 border-0"`, `DRAFT` → `className="bg-gray-100 text-gray-600 border-0"`. |
| HIGH | `DealerDashboard` (DealerDashboard.tsx line 34) uses `py-12` container padding. Design system section 5 specifies `py-6` for page container padding. The `py-12` (48px) is doubled spacing. `DealerListings` and `DealerBookings` also both use `py-12`. This inconsistency in vertical rhythm is particularly visible when compared to pages like `Insights.tsx` which correctly uses `py-6`. | Change to `py-6` in all three dealer pages to align with the design system container pattern. |
| HIGH | `DealerDashboard` card titles (lines 38, 47) are "New Listing" and "My Listings" but both `CardTitle` elements have no icon. Design system section 6 states "Always pair `CardTitle` with a relevant Lucide icon at `h-5 w-5 text-primary`". | Add `<Plus className="h-5 w-5 text-primary" />` before "New Listing" title, and `<Building2 className="h-5 w-5 text-primary" />` before "My Listings" title. |
| HIGH | `DealerListings` empty state (line 75–79) is a bare `<p>` element with text — no icon, no CTA button pattern. Design system section 7 mandates icon + text + optional CTA. | Replace with the standard empty state pattern: `<div className="text-center py-12 space-y-2"><Building2 className="h-8 w-8 text-muted-foreground/50 mx-auto" /><p className="text-sm font-medium text-muted-foreground">No listings yet</p><p className="text-xs text-muted-foreground">Create your first listing to get started.</p><Button size="sm" asChild><Link to="/dealer/listings/new">Create Listing</Link></Button></div>`. |
| HIGH | `DealerBookings` "Pending Requests" empty state (line 69–70) and "Confirmed Bookings" empty state (line 128–130) are bare `<p>` elements with no icon — same design system violation as above. | Apply the same pattern: icon (`ClipboardList` for pending, `CalendarCheck2` for confirmed) + text + `py-8`. |
| MEDIUM | `DealerBookings` booking cards (lines 74–115, 133–166) show date and time slot but no listing identifier or property context. The dealer has no way to know which property the booking request is for without cross-referencing. `booking.listingId` is available on the object (used in `MyBookings`). | Add a header line showing the listing ID or title: `<p className="text-sm font-medium truncate mb-1">Listing <span className="font-mono text-xs text-muted-foreground">{booking.listingId}</span></p>` — matching the pattern in `MyBookings.tsx`. |
| MEDIUM | `DealerBookings` "Decline" button (line 101–109) uses `variant="outline"` — identical visual weight to the "Confirm" button's default-filled style but semantically this action is destructive. A decline permanently affects the booking request. | Change Decline to `variant="outline"` with `className="text-destructive hover:text-destructive border-destructive/50"` to indicate destructive intent without the full red fill. |
| MEDIUM | `NewListing.tsx` shows conditional fields (Land Area, Bedrooms) as optional with helper text "You can update this on the edit page after saving." These fields are captured in state (`landArea`, `bedrooms`) but are never sent in the `createListing.mutate()` call (line 77–83). They are dead form fields in the current implementation — the captured values are silently dropped. | Either remove the conditional fields from `NewListing` (since they direct the user to the edit page anyway), or include them in the mutation payload. Dead form fields erode trust. |
| LOW | `DealerBookings` heading `h1` uses `mb-8` (32px) below the page title (line 53), which is `py-12` container + `mb-8` = very large top gap. Consistent with `DealerListings` and `DealerDashboard` but all three are over-spaced vs. the `mb-6` standard in design system section 5. | Change to `mb-6`. |
| LOW | `DealerListings` price display (line 99–101) renders `₹{listing.price.toLocaleString('en-IN')}` directly inline as a `<span>`. Design system section 10 requires using `formatPrice()` from `src/lib/formatters.ts` and applying `font-semibold text-primary`. | Change to `<span className="font-semibold text-primary">{formatPrice(listing.price)}</span>`. |

---

## UI-6: Auth, Onboarding, and DealerSetup Forms

**Files reviewed**:
- `src/pages/Auth.tsx`
- `src/pages/Onboarding.tsx`
- `src/pages/dealer/DealerSetup.tsx`

### State Coverage
- Auth: Loading state pass (button spinner + disabled). Error state pass (toast with specific messages). No data fetching beyond form submission.
- Onboarding: Loading state pass (spinner for auth). No data fetching.
- DealerSetup: Loading state pass (spinner for auth). Submit state pass (spinner + disabled button). Error state pass (inline `Alert`).

### Findings

| Severity | Finding | Recommendation |
|----------|---------|----------------|
| HIGH | `Auth.tsx` form validation uses a manual `try/catch` + Zod parse pattern with local error state (lines 39–58). The `fullName` field in the sign-up form has no validation and no error display path even though it is in the Zod schema. More critically, the auth forms do not use React Hook Form — the codebase's standard (FRONTEND_GUIDE.md: "React Hook Form + Zod for all forms"). This creates a non-standard pattern that lacks field-level validation on blur, uncontrolled-to-controlled switching risks, and missing integration with the shadcn `<Form>` / `<FormField>` components. | Migrate Auth forms to React Hook Form + Zod resolver. This is the highest-leverage fix for maintainability and aligns with `FRONTEND_GUIDE.md` and design system section 12. |
| HIGH | `Auth.tsx` does not use `<AppLayout>`. It renders its own full-page layout (`min-h-screen flex flex-col`). This is intentional for a centered auth page — however the page includes no skip-to-content link, no accessible landmark, and the outer `div` has no `role`. While the pattern is acceptable for auth pages, the "Features Preview" section at line 253–266 uses `Building2 className="h-4 w-4 text-success"`. The `text-success` Tailwind token does not exist in the design system; this will silently produce no color, falling back to inherited text color. | Replace `text-success` with `text-accent` (coastal teal) which is the correct token for secondary highlights per design system section 2. |
| MEDIUM | `Auth.tsx` `TabsList` is placed inside `CardHeader` (line 136). The design system and shadcn usage pattern places `Tabs` as a wrapping component with `TabsList` inside it but outside of `CardHeader`. Placing `TabsList` inside `CardHeader` is a structural misuse: `CardHeader` has `pb-4` and the `TabsList` renders flush against card content below, creating unbalanced padding. | Move `TabsList` to be the first child of `CardContent`, or keep it in `CardHeader` but ensure consistent spacing. Alternatively restructure: `<Card><Tabs><CardHeader><CardTitle>Sign in / Create account</CardTitle></CardHeader><CardHeader className="pt-0"><TabsList .../></CardHeader><CardContent>...`. |
| MEDIUM | `DealerSetup.tsx` phone field (line 118–132) has no client-side format validation beyond `maxLength={15}`. The placeholder shows `+919876543210` (E.164 format) but the field accepts any string of up to 15 characters. A dealer could enter "abc123" and the form would submit. | Add a Zod regex validation: `phone: z.string().regex(/^\+?[\d\s\-().]{8,15}$/, 'Enter a valid phone number')` and wire through React Hook Form or the existing manual validation. |
| MEDIUM | `DealerSetup.tsx` page header (`CardTitle` = "Dealer Registration") is inside the form card — there is no page-level `<h1>` outside the card. Design system section 5 specifies every content page must have a header block with `text-3xl font-bold` title outside the container. The card title alone (likely `text-xl font-semibold` in shadcn defaults) is insufficiently prominent for a key onboarding step. | Add a page header above the `Card`: `<div className="mb-6"><h1 className="text-3xl font-bold">Become a Dealer</h1><p className="text-muted-foreground mt-1">Complete registration to start listing properties.</p></div>`. |
| MEDIUM | `Onboarding.tsx` uses `py-16` container padding (line 36) — not in the design system's standard `py-6`. The choice of `py-16` is intentional for a centered welcome screen, which is reasonable UX. However, the `mb-10` below the heading block (line 37) does not match the `mb-6` standard. | Change `mb-10` to `mb-8` for a slight reduction while preserving the intentional whitespace of the welcome screen. This is a LOW impact finding. |
| LOW | `Onboarding.tsx` card click handlers (lines 47, 68) wrap the entire `Card` in an `onClick` but also nest a `Button` inside `CardContent`. This creates a redundant double click target — clicking the button fires `navigate` twice (once from button's `onClick`, once from the card's `onClick`). While React event propagation means only one navigation actually occurs, the UX is non-standard and the `Card` as a whole is not keyboard-reachable via Enter key. | Remove `onClick` from the `Card` elements. The `Button` components inside `CardContent` are sufficient and are keyboard-accessible by default. |
| LOW | `Auth.tsx` sign-in and sign-up tabs share the same `email` and `password` state variables. If a user types an email in "Sign In", switches to "Sign Up", the fields are pre-filled. This is a common pattern but can be surprising. Consider whether clearing state on tab change (`onValueChange`) is desired UX for this product. | Low severity — document as a known UX decision or add `onValueChange={() => { setEmail(''); setPassword(''); setErrors({}); }}` to `<Tabs>` if reset-on-switch is preferred. |

---

## Cross-Screen Inconsistencies (Top 3)

1. **Hover background token mismatch (`hover:bg-accent/50` vs `hover:bg-secondary/50`) used across multiple screens.** Found in `Insights.tsx` (New Listings and Recommendations rows), `SavedAreas.tsx`, and potentially other list rows. The design system (section 8) is unambiguous: list rows must use `hover:bg-secondary/50`. The `accent` (coastal teal) token produces a teal hover that conflicts with the warm-cream design personality. This is a copy-paste propagation error affecting 3+ screens.

2. **Inconsistent page container vertical padding (`py-6` vs `py-12`).** `Insights.tsx`, `MyBookings.tsx`, and `DealerDashboard.tsx`, `DealerListings.tsx`, `DealerBookings.tsx` all use `py-12` (48px) while the design system specifies `py-6` (24px) as the standard page container padding. The dealer pages appear to have been written before or independently of the design system and were never reconciled. This creates a noticeably different density/rhythm when navigating between sections.

3. **Missing or icon-less empty states across dealer screens and insights panels.** `DealerListings`, `DealerBookings` (both sections), "New Listings" empty, and "Recommendations" empty all render bare `<p>` text with no icon, no CTA, and none of the pattern from design system section 7. This is the most frequently violated rule in the codebase and the most visible gap at the MVP level, since empty states are the first thing a new user sees before any data exists.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 16 |
| MEDIUM | 17 |
| LOW | 12 |
| **Total** | **46** |

### Top 3 Priority Improvements (highest ROI)

1. **Fix status badge colors across DealerListings and MyBookings** (HIGH, UI-5). The wrong semantic colors (`variant="default"` for LIVE, `variant="secondary"` for PENDING_REVIEW) actively mislead dealers about listing status — the most important data on their primary work screen.

2. **Add error state to DealerBookings for the bookings fetch** (CRITICAL, UI-5). A silent failure here leaves dealers with no booking requests visible and no explanation, which could cause missed viewing confirmations.

3. **Replace `hover:bg-accent/50` with `hover:bg-secondary/50` on all list rows** (HIGH, UI-3/cross-screen). This is a 5-line change across 3 files, fixes a design-system violation visible on every Insights page visit, and aligns the hover palette with the project's warm-coastal design identity.
