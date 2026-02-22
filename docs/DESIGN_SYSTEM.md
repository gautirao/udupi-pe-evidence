# Design System — Udupi Property Explorer

**Status**: Active (established Sprint 6)
**Applies to**: All frontend screens. New screens MUST follow this guide.
**Enforced by**: `ui-designer` agent reviews, PR checklist.

---

## 1. Design Personality

**Warm & local.** Trustworthy, approachable, community-driven.
Inspired by Karnataka's coastal landscape — terracotta earth, warm cream, coastal teal.

NOT: cold tech blue, generic SaaS gray, dark-mode-first.

---

## 2. Color Palette

All colors use CSS custom properties defined in `src/index.css`. Never use raw hex values in components — always use semantic Tailwind tokens.

### Core tokens

| Token | HSL value | Usage |
|-------|-----------|-------|
| `bg-background` | `45 20% 97%` warm cream | Page background |
| `bg-card` | `0 0% 100%` white | Card surfaces |
| `bg-secondary` | `35 30% 90%` sandy beige | Chip backgrounds, hover surfaces |
| `bg-muted` | `35 20% 94%` | Subtle section backgrounds |
| `text-foreground` | `220 25% 15%` dark slate | Primary body text |
| `text-muted-foreground` | `220 15% 45%` | Secondary labels, metadata |
| `text-primary` | `16 65% 45%` terracotta | Prices, icon accents, active nav |
| `text-accent` | `175 45% 40%` coastal teal | Secondary actions, highlights |
| `border` | `35 25% 88%` warm gray | Card borders, dividers |
| `destructive` | `0 72% 51%` red | Errors, destructive actions |

### Semantic status colors (badges, labels)

| Status | Badge class | When to use |
|--------|-------------|-------------|
| LIVE / success | `bg-green-100 text-green-800` | Approved listings |
| PENDING_REVIEW | `bg-amber-100 text-amber-800` | Awaiting admin action |
| REJECTED | `bg-red-100 text-red-800` | Rejected listings |
| DRAFT | `bg-gray-100 text-gray-600` | Unpublished drafts |
| SCRAPED | `bg-blue-100 text-blue-800` | Pipeline-ingested listings |

Use `<Badge>` from shadcn/ui. Do NOT hardcode these colors inline — use the classes above consistently.

### Map pin colors (defined in CSS, do not change)

| Type | CSS var |
|------|---------|
| land | `--pin-land` green |
| house | `--pin-house` terracotta |
| commercial | `--pin-commercial` blue |
| other | `--pin-other` gray |

---

## 3. Typography

### Scale

| Use case | Class |
|----------|-------|
| Page title | `text-2xl font-bold` or `text-3xl font-bold` |
| Section heading | `text-lg font-semibold` or `text-xl font-semibold` |
| Card title | `text-base font-semibold` |
| Body text | `text-sm` (default for most content) |
| Secondary / metadata | `text-sm text-muted-foreground` |
| Tiny labels, timestamps | `text-xs text-muted-foreground` |
| Price display | `font-semibold text-primary` (+ appropriate size) |

### Rules
- Page titles: always `font-bold`, never `font-medium`
- Card titles: `font-semibold`, not `font-bold`
- Body: `text-sm` as default — never `text-base` for list items or secondary content
- Avoid more than 3 font weight levels on a single screen

---

## 4. Spacing

Use Tailwind's default scale. Never use arbitrary values like `p-[13px]`.

| Use case | Value |
|----------|-------|
| Page container padding | `px-4 py-6` |
| Card inner padding | `CardContent` uses `p-6` by default |
| Card header padding | `CardHeader` uses `p-6 pb-0` by default |
| List item row | `p-3` |
| Section gap | `gap-6` |
| Inline icon + text gap | `gap-2` |
| Small inline gap | `gap-1.5` |
| Stack spacing within card | `space-y-3` or `space-y-4` |

---

## 5. Layout Patterns

### Page container

Every page that uses `<AppLayout>` must use this container:

```tsx
<AppLayout>
  <div className="container mx-auto px-4 py-6 max-w-7xl">
    {/* content */}
  </div>
</AppLayout>
```

### Page header

Every content page must have a header block immediately inside the container:

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold">Page Title</h1>
  <p className="text-muted-foreground mt-1">
    One-line description of what this page is for.
  </p>
</div>
```

### Grid layout

Standard two-column content layout:

```tsx
<div className="grid gap-6 lg:grid-cols-3">
  <div className="lg:col-span-1">{/* sidebar */}</div>
  <div className="lg:col-span-2 space-y-6">{/* main content */}</div>
</div>
```

Single-column full-width:

```tsx
<div className="space-y-6">
  {/* stacked cards */}
</div>
```

---

## 6. Card Pattern

### Standard card

```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <IconName className="h-5 w-5 text-primary" />
      Section Title
    </CardTitle>
    <CardDescription>One-line description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</Card>
```

Rules:
- Always pair `CardTitle` with a relevant Lucide icon at `h-5 w-5 text-primary`
- Always include `CardDescription` for context (even if brief)
- Never nest cards inside cards

---

## 7. Four-State Pattern (MANDATORY)

Every data-fetching component MUST handle all four states. No exceptions.

### Loading state

```tsx
<div className="flex items-center justify-center py-8">
  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
</div>
```

Use `<Skeleton>` for layout-aware loading (when you know the approximate shape):

```tsx
<div className="space-y-3">
  <Skeleton className="h-12 w-full rounded-lg" />
  <Skeleton className="h-12 w-full rounded-lg" />
  <Skeleton className="h-12 w-3/4 rounded-lg" />
</div>
```

Prefer `<Skeleton>` for list and card content. Use `<Loader2>` only for small inline areas.

### Error state

```tsx
<div className="flex items-center gap-2 text-destructive py-4">
  <AlertCircle className="h-5 w-5 flex-shrink-0" />
  <p className="text-sm">Failed to load [thing]. Try refreshing.</p>
</div>
```

For recoverable errors, add a retry button:

```tsx
<div className="text-center py-8 space-y-2">
  <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
  <p className="text-sm text-muted-foreground">Failed to load listings</p>
  <Button variant="outline" size="sm" onClick={refetch}>Try again</Button>
</div>
```

### Empty state

```tsx
<div className="text-center py-12 space-y-2">
  <IconName className="h-8 w-8 text-muted-foreground/50 mx-auto" />
  <p className="text-sm font-medium text-muted-foreground">No [items] yet</p>
  <p className="text-xs text-muted-foreground">
    Descriptive hint about how to add items.
  </p>
  {/* Optional CTA */}
  <Button size="sm" variant="outline" asChild>
    <Link to="/some/action">Create your first listing</Link>
  </Button>
</div>
```

Rules:
- Empty state MUST include a relevant icon (not just text)
- Include a CTA when the user can take action to fill the empty state
- Use `py-12` for full card empties, `py-8` for inline empties

### Data state

The happy path. No special wrapper needed — just render the data.

---

## 8. List Row Pattern

For any scrollable list of items (listings, bookings, notifications, etc.):

```tsx
<div className="space-y-2">
  {items.map((item) => (
    <div
      key={item.id}
      className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-secondary/50 transition-colors cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        {/* Left content */}
      </div>
      <div className="flex-shrink-0 ml-3">
        {/* Right action / badge */}
      </div>
    </div>
  ))}
</div>
```

Rules:
- Always use `min-w-0` on the flex-1 content side to allow text truncation
- Always use `flex-shrink-0` on the action side
- `hover:bg-secondary/50` (warm beige tint) — not `hover:bg-accent/50`
- Use `space-y-2` between rows (tighter) or `space-y-3` for roomier lists

---

## 9. Badge Usage

```tsx
{/* Property type */}
<Badge variant="secondary" className="capitalize">
  {listing.propertyType}
</Badge>

{/* Status — use color classes per section 2 */}
<Badge className="bg-green-100 text-green-800 border-0">LIVE</Badge>
<Badge className="bg-amber-100 text-amber-800 border-0">Pending Review</Badge>
<Badge className="bg-red-100 text-red-800 border-0">Rejected</Badge>
<Badge className="bg-gray-100 text-gray-600 border-0">Draft</Badge>

{/* Score / highlight */}
<Badge className="bg-primary/10 text-primary border-0">
  Top pick
</Badge>
```

Never use `variant="default"` with an overridden background color class — use `className` directly with `border-0`.

---

## 10. Price Display

```tsx
{/* Primary price — always prominent */}
<p className="font-semibold text-primary text-base">
  ₹{formatPrice(price)} <span className="text-sm font-normal text-muted-foreground">/ cent</span>
</p>

{/* Comparison price */}
<p className="text-sm text-muted-foreground">
  Market avg: ₹{formatPrice(marketPrice)}
</p>
```

Rules:
- Always use `text-primary` for the main price
- Always use `formatPrice()` from `src/lib/formatters.ts`
- Show unit (per cent, per sqft) in smaller, muted text beside the number

---

## 11. Action Buttons

Use the pattern appropriate to context:

| Context | Variant | Size |
|---------|---------|------|
| Primary page CTA | `default` | `default` |
| Secondary / less prominent | `outline` | `default` or `sm` |
| Inline list action | `ghost` | `sm` |
| Destructive (delete, reject) | `destructive` | `sm` |
| Icon-only toolbar button | `ghost` | `icon` |

Always show an icon beside a label in a ghost button:

```tsx
<Button size="sm" variant="ghost" className="gap-1.5">
  <Eye className="h-3.5 w-3.5" />
  View
</Button>
```

---

## 12. Form Patterns

### Field layout

```tsx
<div className="space-y-4">
  <div className="space-y-2">
    <Label htmlFor="field-id">Field Label</Label>
    <Input id="field-id" placeholder="Placeholder text" />
    {/* Error message */}
    {errors.fieldName && (
      <p className="text-sm text-destructive">{errors.fieldName.message}</p>
    )}
  </div>
</div>
```

### Submit button row

```tsx
<div className="flex items-center justify-end gap-3 pt-4">
  <Button type="button" variant="outline" onClick={onCancel}>
    Cancel
  </Button>
  <Button type="submit" disabled={isSubmitting}>
    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
    Submit
  </Button>
</div>
```

Rules:
- Use React Hook Form + Zod for all forms
- Field errors appear below the input in `text-sm text-destructive`
- Submit button shows spinner + is disabled while submitting

---

## 13. Responsive Breakpoints

| Breakpoint | Width | Pattern |
|------------|-------|---------|
| `sm` | 640px | Show/hide secondary labels |
| `md` | 768px | Switch from single to 2-column |
| `lg` | 1024px | Full layout (3-column grids) |

Table → card-list pattern on mobile:

```tsx
{/* Mobile: hidden, show card version */}
<div className="md:hidden space-y-3">
  {items.map(item => <MobileCard key={item.id} item={item} />)}
</div>

{/* Desktop: full table */}
<Table className="hidden md:table">
  ...
</Table>
```

---

## 14. Icon Usage

All icons from `lucide-react`. Standard sizes:

| Context | Size class |
|---------|-----------|
| Card title icon | `h-5 w-5` |
| Nav item icon | `h-4 w-4` |
| Inline button icon | `h-3.5 w-3.5` |
| Empty state hero icon | `h-8 w-8` |
| Loading spinner | `h-6 w-6` |
| Error alert icon | `h-5 w-5` |

Icon color rule:
- In card titles: `text-primary`
- In nav links: inherits from link state
- In muted contexts: `text-muted-foreground`
- In empty states: `text-muted-foreground/50`

---

## 15. Map UI Rules

The Leaflet map is the primary UI surface on the home screen. Overlaid UI must not fight it.

| Element | Rule |
|---------|------|
| Filter sidebar | Use `<Sheet side="left">` or `<Sheet side="right">`, never a blocking panel |
| Property detail | Open in `<Sheet side="right">` or navigate to detail page |
| Floating toolbar | Keep narrow, use `Button variant="ghost" size="icon"` |
| z-index | Overlays must use `z-[1000]` or higher (leaflet uses z-index 400–999) |
| Filter chips | Prefer horizontal chip row over dropdown for 3–5 options |

---

## 16. Accessibility Baseline

Every component must meet:

- Interactive elements have accessible labels (`aria-label` or visible text)
- Focus rings are visible (shadcn handles this via `ring` classes)
- Color is never the only way to convey information (pair with icon or text)
- Minimum contrast: WCAG AA (4.5:1 for normal text, 3:1 for large)
- Keyboard: primary flows completable via keyboard only

---

## 17. What NOT to do

- Do not use arbitrary Tailwind values (`p-[13px]`, `text-[#b45309]`)
- Do not hardcode hex colors anywhere in JSX
- Do not use `variant="default"` badge with a className color override AND `border` showing
- Do not skip the empty state (blank white space is not acceptable)
- Do not skip the loading state
- Do not use `window.location.reload()` — use `queryClient.invalidateQueries` + `navigate`
- Do not put `setState` calls in the render body — use `useEffect`
- Do not call data-fetching hooks unconditionally for paywalled/role-gated content — use `enabled:` guard

---

## Checklist for new screens

Before opening a PR for any new screen, verify:

- [ ] Uses `<AppLayout>` with `container mx-auto px-4 py-6 max-w-7xl`
- [ ] Has page header (`text-3xl font-bold` title + `text-muted-foreground` subtitle)
- [ ] All data sections handle: loading (Skeleton), error (AlertCircle + message), empty (icon + text + optional CTA), data
- [ ] All badges use the standard status color classes from section 2
- [ ] All prices use `text-primary font-semibold` + `formatPrice()`
- [ ] Role-gated actions are hidden (not just disabled) from unauthorized roles
- [ ] No arbitrary Tailwind values
- [ ] Responsive: tested at `sm`, `md`, `lg` widths
- [ ] Accessibility: all interactive elements are keyboard-reachable and labeled

Last updated: 2026-02-22
