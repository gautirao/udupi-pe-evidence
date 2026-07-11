# Broker "My Listings" v2 — Productivity Redesign

## Overview
Second iteration focused on **broker density, attention hierarchy, and urgent action visibility**. Includes two layout options (A and B) for comparison.

**File:** `ui_kits/broker/listings-v2.html` (includes layout toggle for testing both)

## Key Improvements from V1

### 1. Reduced Visual Whitespace
- Card padding: 16px → 12px
- Gap between cards: 16px → 12px
- Title size: 18px → 13px
- Meta text size: 14px → 12px
- **Result:** ~50% more listings visible per screen

### 2. Smaller, Less Dominant Thumbnails
- **Layout A:** 140px × 140px → 80px × 80px (left sidebar)
- **Layout B:** 140px height → 120px height (full width)
- Placeholder text: Smaller, less prominent
- **Result:** Thumbnail no longer dominates card; content takes priority

### 3. Attention Hierarchy & Urgency
- **"Needs attention" stat** (new): Prioritized first in metrics strip
  - Includes: quality issues + enquiries + viewing requests + under-review + pending actions
  - Clickable to filter → shows all listings needing broker action
- **Amber border** on attention cards for visual scanning
- **Context-aware primary action** (see below)
- **Enquiry/viewing request badges** now visually prominent (navy blue background)

### 4. Context-Aware Primary Action
First button changes based on listing state:
```
Quality issue (needs-work/incomplete) → "Improve" (amber/urgent)
Viewing request pending             → "Review request" (amber/urgent)
New enquiries/messages              → "Reply" (amber/urgent)
Under review                        → "Check status" (navy/primary)
Normal live listing                 → "Edit" (default grey)
```

**Benefit:** Broker's eye goes to the most important action for that listing.

### 5. Stat Strip Redesign
**Old order:** Total, Live, Review, Drafts, Quality issues, With enquiries
**New order (action-focused):**
1. **Needs attention** ← Primary KPI (clickable filter)
2. **New enquiries** ← Urgent follow-up
3. **Viewing requests** ← Urgent follow-up
4. **Under review** ← Pending approval
5. **Drafts** ← Pending publish
6. **Total** ← Reference

Each stat is clickable to filter/focus view.

### 6. Messages & Enquiries Visibility
- **Badge placement:** Integrated into status line (Layout A) or badge row (Layout B)
- **Visual weight:** Navy blue background, same size as status badges
- **Icon + count:** "💬 3" for messages, "👁 2" for viewing requests
- **Benefit:** Can't miss them; not hidden in small text

### 7. Quality Issue Callouts
- Top issue shown in amber warning badge if present
- Example: "⚠ Add 3+ photos"
- Amber border on card for listings with issues
- **Benefit:** Visual scan shows what work is needed

### 8. Secondary Actions
- "Area insights" button (Layout A: "→ Area", Layout B: "Area insights")
- Always available, but not primary
- Stays compact so urgent actions dominate

---

## Layout A: Compact Single-Column List

### Structure
- **Horizontal grid:** Thumbnail | Content (grows) | Actions
- **Thumbnail:** 80px × 80px (left sidebar, always visible)
- **Content:** Title, metadata, status/quality/issue badges, enquiry indicators
- **Actions:** Primary button + "Area insights" button (right sidebar, sticky on scroll)

### Listing Card Anatomy
```
┌─────────────────────────────────────────────────────────┐
│ [80×80] │ Title                       │ [Improve] [Area] │
│  photo  │ 📍 Area • Type • ₹Price     │                  │
│         │ Live ✓Good Enquiry:3 Req:1  │                  │
└─────────────────────────────────────────────────────────┘
```

### Advantages
✅ **Maximum scanability** — All key info in one horizontal line  
✅ **Many listings visible** — 8–10 listings per screen on 1400px viewport  
✅ **Focus on action** — Primary button always visible, always clickable  
✅ **Familiar UX** — Similar to email/inbox list view  
✅ **Dense but professional** — Not cramped, still readable  

### Disadvantages
❌ Text truncation if title is long  
❌ Metadata line can wrap if viewport narrow  
❌ Thumbnail is decorative, not a strong visual anchor  

### Best for
- **Brokers with 20+ listings** (where density matters)
- High-volume workflow
- Quick scanning + bulk actions
- Desktop-first use

---

## Layout B: Two-Column Card Grid

### Structure
- **2 columns on desktop** (1 column on tablet/mobile)
- **Thumbnail:** Full-width, 120px height (visual anchor at top)
- **Content:** Title, metadata, badges, actions below
- **Actions:** Grid layout (2 columns: primary + secondary)

### Listing Card Anatomy
```
┌─────────────────────────┐
│   [120px photo/blank]   │
│ Title (up to 2 lines)   │
│ 📍 Area • Type          │
│ ₹Price                  │
│ Live ✓Good Enquiry:3    │
│ [Improve Button]        │
│ [Area Insights]         │
└─────────────────────────┘
```

### Advantages
✅ **Visual breathing room** — Cards feel less dense  
✅ **Photo/placeholder is visible** — Good if photos matter  
✅ **Actions are full-width** — Easier to tap/click  
✅ **Familiar card pattern** — Feels like modern app  
✅ **Better on tablet** — Natural 2-column → 1-column collapse  

### Disadvantages
❌ **More vertical scrolling** — Only 4–6 cards per screen  
❌ **Takes more space** — Not ideal for brokers with 50+ listings  
❌ **Actions less prominent** — Split into two columns  

### Best for
- **Brokers with <20 listings**
- Focus on visual presentation
- Emphasis on photo/property appearance
- Tablet-forward workflow

---

## Recommended Layout: **A (Compact Single-Column List)**

### Reasoning

**For a broker productivity tool, Layout A is superior because:**

1. **Density wins for productivity** — Brokers with even 10–15 listings see all of them without scrolling on Layout A; Layout B requires 3+ scroll. More control = less cognitive load.

2. **Action visibility is paramount** — Layout A keeps primary action always visible and right-aligned; Layout B buries it in a 2-column grid. For urgent work (reply to enquiry, improve listing), Layout A is faster.

3. **Attention design works better in a list** — Amber border + status badges + enquiry count all scan faster in a horizontal line than vertically stacked cards.

4. **Email/inbox UX is proven** — Brokers already know how to use Gmail/Outlook inbox-style lists. Reusing that pattern is lower friction.

5. **Secondary info doesn't need visual prominence** — Photos/thumbnails are nice but secondary on a management page. Content + action matter more.

6. **Scalability** — As a broker adds more listings (common growth), Layout A remains manageable; Layout B becomes scrolling hell.

### When to Use Layout B
- If the broker's primary task is *reviewing* properties (showing clients photos, etc.)
- For a consumer-facing "browse" experience
- If photo quality/staging is part of listing quality scoring
- For brokers with <10 listings (small portfolio)

---

## Implementation Notes

### Stats Strip — New Priority Order
The "Needs attention" stat is now first and most prominent:
- **Calculation:** Any listing with:
  - `quality === "needs-work"` OR `quality === "incomplete"`
  - `status === "review"`
  - `enquiries > 0` OR `viewingRequests > 0`
  - `topIssue` present
- **Interaction:** Click to filter view → shows only listings needing action
- **Visual weight:** Larger stat value, amber text when filtered

### Primary Action Logic
```javascript
const getPrimaryAction = (listing) => {
  if (quality is needs-work or incomplete) → "Improve" (urgent/amber)
  else if (viewingRequests > 0) → "Review request" (urgent/amber)
  else if (enquiries > 0) → "Reply" (urgent/amber)
  else if (status === "review") → "Check status" (primary/navy)
  else → "Edit" (default)
};
```

### Badges & Indicators
- **Status badges:** Live (green), Draft (grey), Review (navy), Archived (grey) — small, 22px height
- **Quality badges:** Good (green ✓), Needs work (amber), Incomplete (red) — same style
- **Attention indicator:** Amber badge with top issue text (if present)
- **Enquiry badges:** Navy blue, count only (💬 3, 👁 2)
- **Listing card border:** Normal grey → 2px amber if needs attention

---

## Page States & Interactions

### Default View (Layout A)
- All listings, sorted by last updated (newest first)
- "Needs attention" stat highlighted but not filtered
- Brokers see mix of live + draft + review listings
- Can filter by clicking stat or using dropdown

### "Needs Attention" View
- Click "Needs attention" stat → filter active (blue highlight on stat)
- Only shows listings with quality issues, enquiries, or pending actions
- Helps broker focus on urgent work
- Click stat again to clear filter

### Listing States
- **Live with good quality, no enquiries:** "Edit" button (low priority)
- **Live with quality issue:** Amber border, "Improve" button (urgent)
- **Live with enquiries:** Navy enquiry badge visible, "Reply" button (urgent)
- **Under review:** Navy "Under Review" badge, "Check status" button
- **Draft:** Grey "Draft" badge, "Edit" button (low priority)
- **Archived:** Grey styling, no primary action

---

## Responsive Behavior

### Desktop (1200px+)
- Layout A: Single column, full width, ~10 listings above fold
- Layout B: Two columns, ~6 cards above fold

### Tablet (800–1200px)
- Layout A: Same, slightly compressed
- Layout B: Collapses to single column

### Mobile (<800px)
- Layout A: Collapses to thumbnail above content, actions stack vertically
- Layout B: Single column (normal)
- Filters: Stacked, full width

---

## Integration with Dashboard

### From Broker Dashboard V2
The "My Listings" workspace card should link to `/broker/listings` with:
- Optional pre-filter parameter: `?filter=needs-attention` to show urgent items
- Optional sort: `?sort=priority` to show attention-needed listings first

### Navigation
- "Dashboard" link in header returns to Broker Dashboard V2
- "Area insights" button routes to `/broker/areas/:city/:area`
- Quality improvement actions link to Listing Quality feature

---

## Future Enhancements (Out of Scope)

1. **Bulk actions** — Select multiple listings to archive/edit/etc.
2. **Inline quick-edit** — Edit title, price, area without full form
3. **Real-time notifications** — New enquiry bell, visual pulse on card
4. **Sorting** — By date, by price, by quality, by enquiries
5. **Saved filters** — "My enquiries", "Needs photos", etc.
6. **Customer inbox** — Link enquiry badge to full message thread
7. **Analytics** — Views, enquiry rate, response time per listing
8. **Mobile app** — Native version of Layout A for on-the-go

---

## File Location
`ui_kits/broker/listings-v2.html`

## Testing Both Layouts
The file includes a layout toggle at the top of the content area. Click "Single-column (compact list)" or "Two-column (card grid)" to switch between Layout A and B.

**Recommendation for production:** Deploy Layout A as the default. Keep Layout B as an alternate view if brokers want a different experience.
