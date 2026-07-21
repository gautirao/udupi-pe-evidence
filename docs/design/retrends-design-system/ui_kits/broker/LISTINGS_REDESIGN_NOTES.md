# Broker "My Listings" Page — Redesign Notes

## Overview
Redesigned `/broker/listings` page to be a polished, broker-focused listings management workspace. Replaces the previous long vertical repetitive card layout with a scannable, well-organized listing management interface.

## Key Design Decisions

### 1. Structure
- **Sticky header**: "My Listings" title + CTA to create new listing + back link to dashboard
- **Compact stats strip**: Total, Live, Under review, Drafts, Quality issues, With enquiries
- **Search + filter bar**: Sticky, compact, searchable by title/area/ID
- **Single-column listing grid**: Each card spans full width for readability

### 2. Listing Card Layout
- **Thumbnail + content grid** (desktop: 140px thumbnail on left; mobile: thumbnail spans full width above content)
- **Visual hierarchy**:
  - Title at top
  - Status + quality badges (right-aligned on desktop, wrapped on mobile)
  - Metadata row: area, type, sale/rent, last updated
  - Price prominent
  - Top quality issue (if any) in amber warning tone
  - Enquiry/viewing request indicators (blue badges)
  - Action buttons (compact row at bottom)

### 3. Status & Quality Badges
- **Status badges**: Live (green), Draft (grey), Under review (navy), Archived (grey)
- **Quality badges**: Good (green ✓), Needs work (amber), Incomplete (red)
- Small, clean, stackable on mobile

### 4. Key Features
- **Search**: By title, area, or listing ID
- **Filters**: Status, Property type, Sale/Rent, Quality status
- **Stats**: Clickable stat items for quick overview
- **Enquiry indicators**: Shows message and viewing request counts directly on card
- **Actions**: Preview, Edit, Improve (quality), Area insights, More menu
- **Empty state**: When no listings or no results after filtering

### 5. Visual System (from Broker Dashboard V2)
- **Background**: Warm off-white (`var(--canvas-100)`)
- **Cards**: White with soft border and shadow
- **Primary actions**: Navy (`var(--navy-800)`)
- **Quality/attention**: Amber warning tone (`var(--caution)`)
- **Status colors**: Green for live, grey for drafts/archived, navy for review
- **Typography**: Plus Jakarta Sans, professional hierarchy

### 6. Responsive Design
- **Desktop (1080px+)**: Listing cards with left thumbnail, filters in single row
- **Tablet (900px–1080px)**: Smaller thumbnail, filters wrap
- **Mobile (640px–900px)**: Full-width thumbnails, stacked filters, button full-width actions
- **Mobile <640px**: Extreme stacking, simplified layout

## Data Structure (Mock)
Each listing object:
```javascript
{
  id: 1,
  title: "Luxury 3BHK with Sunlit Courtyard",
  area: "Balmatta, Udupi",
  price: "₹78,50,000",
  type: "Apartment",      // "Apartment", "House", "Villa", "Commercial"
  saleRent: "Sale",       // "Sale" or "Rent"
  status: "live",         // "live", "draft", "review", "archived"
  quality: "good",        // "good", "needs-work", "incomplete", or null
  thumbnail: null,        // URL or null (shows placeholder)
  lastUpdated: "2 days ago",
  enquiries: 3,
  viewingRequests: 1,
  topIssue: null,         // "Add 3 more photos" or similar; null if good
}
```

## Stats Calculation
- **Total**: All listings
- **Live**: status === "live"
- **Review**: status === "review"
- **Drafts**: status === "draft"
- **Quality issues**: quality === "needs-work" OR "incomplete"
- **With enquiries**: enquiries > 0 OR viewingRequests > 0

## Integration Notes

### From Broker Dashboard V2
- The "My Listings" workspace card/link on the dashboard should route to `/broker/listings`
- Link: `href="/broker/listings"` or use the existing dashboard's router

### Future Features (Out of Scope for This Design)
- **Full messaging/customer interaction**: Design separately; for now, showing count badges only
- **Listing quality flow**: Mock shows "Improve" button; link to existing quality page or future redesign
- **Area insights**: Mock shows "Area insights" button; link to `/broker/areas/:city/:area` if available
- **Archive/duplicate/more actions**: "More" menu can expand to show these; full interaction flows separate
- **Broker notifications/inbox**: Design separately; this page focuses on listing-level indicators

### Listing Quality Integration
- Show quality badge on each card
- Top 1 quality issue shown in amber warning if applicable
- "Improve" button for listings that need work
- Should link to the existing Listing Quality workspace or feature

### Area Insights
- "Area insights" action on each card
- Should route to `/broker/areas/:city/:area` if that endpoint exists
- Purpose: Help broker understand market context for that listing's area
- If area insights doesn't exist yet, mark as route-ready for future implementation

## States to Document

### Listing States
1. **Live** - Published, showing on market
2. **Draft** - Not yet published, work in progress
3. **Under review** - Submitted for moderation/approval
4. **Archived** - Previously live, now removed from market
5. **Needs quality fixes** - Has one or more quality issues
6. **Has messages** - Broker has received enquiries
7. **Has viewing requests** - Showing requests pending

### Page States
1. **All listings** - Default view with filtering applied
2. **Empty** - No listings created yet
3. **No results** - Filters applied but no matches
4. **Loading** - (Not mocked; would show skeleton cards)

## Styling Approach
- Inline styles for quick iteration
- Uses design system tokens from `styles.css`
- Responsive breakpoints at 900px and 640px
- Hover states on cards and buttons for feedback
- No CSS animations (kept to DOM structure)

## Next Steps for Implementation

1. **Backend Integration**: Replace mock data with real API calls
2. **Routing**: Wire up dashboard link → `/broker/listings`
3. **Listing Quality**: Connect "Improve" button to quality feature
4. **Area Insights**: Connect "Area insights" to area intelligence page
5. **Search/Filters**: Backend search and filter logic
6. **Pagination**: Add if listing count exceeds ~50 per page
7. **Bulk actions**: Consider adding multi-select for batch archive/edit
8. **Notifications**: Real enquiry/viewing request counts from backend

## File Location
`ui_kits/broker/listings.html`

## Visual Baseline
Based on `ui_kits/broker/dashboard-v2.html` — uses same token system, color palette, typography, and spatial rhythm.
