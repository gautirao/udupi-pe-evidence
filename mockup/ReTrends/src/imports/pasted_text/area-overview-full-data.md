Design a desktop product page for a real-estate app called **ReTrends**.

Create **3 separate frames** for the same page pattern:

1. **Area Overview — Full Data**
2. **Area Overview — Limited Data**
3. **Area Overview — Fallback Data**

This is an **MVP Area Overview page**, not a trends dashboard.
Do **not** add tabs, synthetic scores, market indicators, or time filters.

## Overall layout

* Desktop-first
* Max content width: **1280px**
* Side padding: **16px**
* Single-column layout
* Clean modern SaaS UI
* Use card-based sections with generous spacing
* No sidebars
* No tabs
* No charts beyond a simple small **property mix bar or donut**
* Visual style should feel trustworthy, calm, and data-honest

## Shared page structure for all 3 frames

Top to bottom:

1. **Breadcrumb**
2. **Area header**
3. **Data basis line**
4. **Fallback notice** (fallback frame only)
5. **Price overview card**
6. **Market activity card** (full + limited only)
7. **Comparison table**
8. **Schools nearby section**
9. **Explore on Map CTA**

Use **24px vertical spacing** between major sections.

---

## Frame 1 — Area Overview: Full Data

Use a confident but restrained visual treatment.

### Breadcrumb

`Home / Area Overview / Koramangala`

### Area header

* H1: **Koramangala**
* Secondary text: **Bangalore · Udupi district**
* Data basis line: **Based on 42 listings in the last 90 days.**
* Data basis line should be neutral, subtle, and trustworthy

### Price overview card

Card title: **Price overview**

Show:

* **Median price** — `₹1.15 Cr/sqft`
* **Price range** — `₹65L – ₹1.8 Cr`
* **Trend** — `Prices rising (~6.5%)`
* **Property mix** — simple bar or donut visualization

### Market activity card

Card title: **Market activity**

2-column stat layout:

* **Active listings** — `42`
* **New this month** — `8`

### Comparison table

Title: **Compare with nearby localities**

Columns:

* Locality
* Median price
* Listings (90 days)
* Trend

Highlight the current locality row visually.

### Schools section

Title: **Schools nearby**

Show up to 5 nearby schools with:

* school name
* board
* small muted metadata
* optional “Notable” badge for top schools

### Explore map CTA

Headline: **Ready to explore properties in Koramangala?**
Body: **View verified listings in this locality on the map.**
Primary button: **Explore on Map →**

---

## Frame 2 — Area Overview: Limited Data

This should feel slightly more cautious, but still useful and complete.

### Breadcrumb

`Home / Area Overview / Katapadi`

### Area header

* H1: **Katapadi**
* Secondary text: **Udupi district**
* Data basis line:
  **Based on 9 listings in the last 90 days. Prices may vary as more data becomes available.**
* Use a subtle **amber-tinted treatment** for this data basis line
* Do not use a separate badge or chip

### Price overview card

Card title: **Price overview**

Show:

* **Median price** — `₹45K/sqft`
* **Price range** — `₹28L – ₹65L`
* **Trend** — `Prices stable (~1.2%)`
* **Property mix** — only if data exists; otherwise omit this row entirely

### Market activity card

Card title: **Market activity**

2-column stat layout:

* **Active listings** — `7`
* **New this month** — `2`

### Comparison table

Same as full-data frame

### Schools section

Same as full-data frame

### Explore map CTA

Headline: **Ready to explore properties in Katapadi?**
Body: **View verified listings in this locality on the map.**
Primary button: **Explore on Map →**

---

## Frame 3 — Area Overview: Fallback Data

This frame must feel honest and helpful, never empty.
This area has too little direct data, so district-level price context is shown instead.

### Breadcrumb

`Home / Area Overview / Tiny Village`

### Area header

* H1: **Tiny Village**
* Secondary text: **Udupi district**
* Data basis line: **This area is new on our platform.**
* Neutral treatment, no badge

### Fallback notice

Show a full-width informational notice directly below the header.

Copy:
**Showing price overview for Udupi district. This locality has fewer than 5 listings on the platform.**

Use a soft info-style visual treatment, not an error state.

### Price overview card

Card title: **Udupi district — price overview**

Show:

* **Median price** — `₹48K/sqft`
* **Price range** — `₹28L – ₹68L`
* **Property mix** — optional if data exists
* Do **not** show trend in fallback mode

### Market activity

Do **not** show this section at all in fallback mode

### Comparison table

Title: **Compare with nearby localities**

If present, this should still feel useful and contextual.

### Schools section

Always show the schools section, even in fallback mode

### Explore map CTA

Headline: **Ready to explore properties near Tiny Village?**
Body: **Browse verified listings in the surrounding area.**
Primary button: **Explore on Map →**

---

## Visual design instructions

* Modern, minimal, trustworthy product UI
* Neutral base palette with subtle semantic accents
* Full data state: neutral
* Limited data state: subtle amber emphasis on the basis line only
* Fallback state: soft informational blue notice
* Rounded cards
* Light borders
* Soft shadows
* Clean typography hierarchy
* H1 should be prominent and crisp
* Use tabular numerals for price/stat values
* Make the page feel information-rich but not crowded

## Typography

* H1: **32px bold**
* Section/card titles: **16px semibold**
* Labels and metadata: **12–14px muted**
* Key values/stats: **24px bold**

## Important behavior rules

* Never show blank or empty-looking sections
* If property mix is missing, omit it cleanly
* In fallback mode, hide market activity completely
* Keep the page single-column in all three frames
* Make all three frames clearly related, with only the necessary state differences

## Explicitly do NOT include

* Tabs
* “Price Trends” tab
* “Supply & Demand” tab
* Demand Score
* Listing Quality %
* Market Indicators
* Key Insights bullet list
* Time period dropdown
* Confidence pill or badge next to the title
* Sidebar layout
* Fake analytics widgets

The result should look like a polished, production-ready **Area Overview** page for a real estate marketplace, with 3 realistic data-confidence states.
