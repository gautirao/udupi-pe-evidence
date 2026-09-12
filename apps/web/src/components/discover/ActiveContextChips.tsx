import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatPrice } from '@/lib/formatters';
import { getPropertyTypeLabel } from '@/lib/propertyTypeConfig';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';
import { resolvePrimaryAreaControlLabel } from '@/features/discover/filters/primaryAreaLabels';
import { Chip, type ChipSpec } from './chips/Chip';

// Issue #1817 — full chip taxonomy per design §3. Scope objects (city, macro-region,
// area group, area, school) are NEVER chips (AC2) — they live exclusively in the
// breadcrumb/header band. This component renders ONLY clearable filter + search state.

const SELLER_LABELS: Record<string, string> = {
  owner: 'Owner',
  broker: 'Broker',
  builder: 'Builder',
};

/** Ordered list of boolean filter keys rendered as chips (render order = declaration order). */
const BOOLEAN_FILTER_LABELS: ReadonlyArray<{
  key: keyof Pick<DiscoverUrlFilters, 'backOnMarket' | 'newToMarket' | 'reraRegistered' | 'readyToMove'>;
  label: string;
  testId: string;
}> = [
  { key: 'backOnMarket', label: 'Back on market', testId: 'chip-bool-bom' },
  { key: 'newToMarket', label: 'New to market', testId: 'chip-bool-ntm' },
  { key: 'reraRegistered', label: 'RERA registered', testId: 'chip-bool-rera' },
  { key: 'readyToMove', label: 'Ready to move', testId: 'chip-bool-rtm' },
];

/**
 * Filter chips shown inline before the rest collapse into the "+N" overflow
 * popover (design §5). A fixed count rather than a ResizeObserver measurement —
 * deterministic, testable, and avoids the resize-instability risk (qa-fast R5) a
 * live measurement would introduce. The search chip and Clear all are NOT counted
 * against this limit — they are always visible (design §5).
 */
const MAX_VISIBLE_FILTER_CHIPS = 4;

/** Mirror of MapFilters.tsx date formatter — co-located here, do NOT import from map/. */
function formatFilterDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

/**
 * Issue #2430 — resolves through the shared label authority instead of a local
 * map. The old map covered six values and fell back to the RAW enum, so a
 * `commercial_building` filter chip read "commercial_building". The shared owner
 * has a human label for every property type (and for the `plot` filter alias),
 * so the raw-token fallback is gone.
 */
function humanizePropertyType(raw: string): string {
  return getPropertyTypeLabel(raw);
}

/** Truncate the search chip label to ~24 chars per design §3/§4. */
function truncateSearchLabel(term: string): string {
  return term.length > 24 ? `${term.slice(0, 24)}…` : term;
}

interface ActiveContextChipsCallbacks {
  onClearPropertyType: () => void;
  onClearBhk: () => void;
  onClearPrice: () => void;
  onClearBoard?: (board: string) => void;
  onClearCategory?: (category: string) => void;
  /** Clear the seller type filter entirely (all values). */
  onClearSeller?: () => void;
  /** Clear both dateFrom and dateTo atomically. */
  onClearDateRange?: () => void;
  /**
   * Issue #2459 — clear both area bounds atomically. Optional so existing callers/tests need no
   * change; the chip still renders when it is absent, matching how `onClearSeller` behaves.
   */
  onClearArea?: () => void;
  /** Clear a single boolean filter by its DiscoverUrlFilters key. */
  onClearBoolean?: (key: keyof Pick<DiscoverUrlFilters, 'backOnMarket' | 'newToMarket' | 'reraRegistered' | 'readyToMove'>) => void;
  /**
   * Issue #1817 (AC10) — clears every filter + the search query in one action,
   * preserving journey/scope/selected object and map camera. Optional so existing
   * callers/tests need no change; the "Clear all" affordance renders only when provided.
   */
  onClearAll?: () => void;
}

interface ActiveContextChipsProps extends ActiveContextChipsCallbacks {
  filters: DiscoverUrlFilters;
  /**
   * Free-text search query (the `q` URL-state field; NOT part of DiscoverUrlFilters).
   * Optional so existing callers/tests need no change. The Search chip renders ONLY
   * when this is non-empty (after trim). Issue #1817 — no longer context-gated on
   * area/school selection: per design §4, the search chip is a first-class piece of
   * result-affecting state at ANY scope (city, region, group, area, school).
   */
  searchQuery?: string;
  /** Clear the free-text search query (clears only `q`, never sibling filters). */
  onClearSearch?: () => void;
}

/**
 * Context bar of dismissable, clearable filter + search chips (design §3–§5, §10).
 * Scope objects (city/region/group/area/school) are never rendered here — AC2.
 * Chips are ordered search → booleans → value filters; beyond MAX_VISIBLE_FILTER_CHIPS
 * the remainder collapses into a "+N" overflow popover; "Clear all" never overflows.
 * Returns null when no chips are active (renders nothing, collapsing the bar).
 */
export function ActiveContextChips({
  filters,
  searchQuery,
  onClearSearch,
  onClearPropertyType,
  onClearBhk,
  onClearPrice,
  onClearBoard,
  onClearCategory,
  onClearSeller,
  onClearDateRange,
  onClearArea,
  onClearBoolean,
  onClearAll,
}: ActiveContextChipsProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [rovingIndex, setRovingIndex] = useState(0);
  const focusableRefs = useRef<Array<HTMLElement | null>>([]);

  const searchTerm = searchQuery?.trim() ?? '';
  const hasSearch = searchTerm !== '';
  const boardFilters = filters.boardFilters ?? [];
  const categoryFilters = filters.categoryFilters ?? [];
  const hasType = filters.propertyTypes != null && filters.propertyTypes.length > 0;
  const hasBhk = filters.bedrooms != null && filters.bedrooms.length > 0;
  const hasPrice = filters.priceMin != null || filters.priceMax != null;
  const hasArea = filters.areaMinSqft != null || filters.areaMaxSqft != null;

  // ── Seller ───────────────────────────────────────────────────────────────
  const sellerLabel = useMemo(() => {
    const types = (filters.sellerTypes ?? []).filter((s) => s.trim() !== '');
    if (types.length === 0) return null;
    const first = SELLER_LABELS[types[0].toLowerCase()] ?? types[0];
    return types.length > 1 ? `Seller: ${first} +${types.length - 1}` : `Seller: ${first}`;
  }, [filters.sellerTypes]);

  // ── Date range ───────────────────────────────────────────────────────────
  const dateLabel = useMemo(() => {
    const { dateFrom, dateTo } = filters;
    if (!dateFrom && !dateTo) return null;
    if (dateFrom && dateTo) {
      return `Listed: ${formatFilterDate(dateFrom)} – ${formatFilterDate(dateTo)}`;
    }
    if (dateFrom) return `Listed: from ${formatFilterDate(dateFrom)}`;
    return `Listed: until ${formatFilterDate(dateTo!)}`;
  }, [filters.dateFrom, filters.dateTo]);

  // ── Active booleans (ordered: bom → ntm → rera → rtm) ───────────────────
  const activeBooleans = useMemo(() => {
    return BOOLEAN_FILTER_LABELS.filter(({ key }) => !!filters[key]);
  }, [filters.backOnMarket, filters.newToMarket, filters.reraRegistered, filters.readyToMove]);

  const hasSeller = sellerLabel != null;
  const hasDate = dateLabel != null;

  // ── Property type / BHK / price labels ────────────────────────────────────
  let typeLabel = '';
  if (hasType) {
    const types = filters.propertyTypes!;
    const firstLabel = humanizePropertyType(types[0]);
    const extra = types.length - 1;
    typeLabel = extra > 0 ? `${firstLabel} +${extra}` : firstLabel;
  }

  let bhkLabel = '';
  if (hasBhk) {
    const beds = filters.bedrooms!;
    const sorted = [...beds].sort((a, b) => a - b);
    if (sorted.length === 1) {
      bhkLabel = `${sorted[0]} BHK`;
    } else if (sorted.length === 2) {
      bhkLabel = `${sorted[0]}, ${sorted[1]} BHK`;
    } else {
      bhkLabel = `${sorted[0]}, ${sorted[1]} BHK +${sorted.length - 2}`;
    }
  }

  let priceLabel = '';
  if (hasPrice) {
    const { priceMin, priceMax } = filters;
    if (priceMin != null && priceMax != null) {
      priceLabel = `${formatPrice(priceMin)} – ${formatPrice(priceMax)}`;
    } else if (priceMin != null) {
      priceLabel = `${formatPrice(priceMin)}+`;
    } else if (priceMax != null) {
      priceLabel = `Up to ${formatPrice(priceMax)}`;
    }
  }

  // ── Contextual area (#2459 AC6) ──────────────────────────────────────────
  // The prefix and, for a broad/mixed selection, the disclosure both come from the shared
  // primary-area vocabulary — the SAME module the control reads. No label text is spelled out
  // here: a second declaration of this taxonomy is precisely the drift #2526 was filed to stop.
  //
  // The disclosure is carried INSIDE the chip label because the meaning is not optional garnish:
  // "800 – 1,200 sq ft" over a mixed selection is comparing built-up area on some rows and plot
  // size on others, and a chip that does not say so is dishonest (D1). Putting it in the label
  // also puts it in Chip's `aria-label` accessible name for free.
  //
  // THIS CHIP WRAPS; NOTHING HERE IS ELLIPSED. It is the only caller passing `wrap` to Chip
  // (see that prop's doc), so the whole label — meaning, bound and disclosure — is on screen at
  // 390px, over two or three lines at the SAME 160px width every other chip gets.
  //
  // ⚠️ SUPERSEDED RATIONALE, kept because it is the sentence a future reader would otherwise
  // reuse. This block previously read "ORDER IS LOAD-BEARING … whatever trails the visible width
  // is ellipsed away", and ordered the label around surviving `truncate`. That was true while the
  // chip truncated. It is now false: the owner ruled (PR #2502) that the honest fix for AC6 rule 5
  // is a TALLER chip rather than a shorter label, so there is no cut-off for the meaning to have
  // to get in front of. The three alternatives that did shorten the label — a wider chip, a
  // narrower vocabulary, and rendering `1,200` as `1.2k` — were all withdrawn; the last of those
  // would have re-introduced on the OUTPUT side exactly the numeric rewriting this PR removed from
  // the INPUT side.
  //
  // The meaning still leads, but for a weaker and more ordinary reason: it is the scannable part
  // of the sentence, and the disclosure reads as its trailing clause. That is a copy preference
  // now, not a visibility guarantee — so a reordering here is a copy decision, no longer a defect.
  //
  // `shortLabel` is RETAINED, and deliberately so. It was introduced because spelling every
  // quantity out in full made a Commercial-broad and the broadest selection both read
  // "Built-up area / warehous" once truncated. Wrapping removes that particular collision, which
  // would make shortening look unnecessary — but the ruling was explicit that today's wording
  // stands and no vocabulary changes in this PR. Widening it back out is a copy change for its
  // own PR, with its own measurement; it is not a tidy-up to fold in here.
  let areaLabel = '';
  if (hasArea) {
    const { disclosure, shortLabel } = resolvePrimaryAreaControlLabel({
      propertyTypes: filters.propertyTypes,
      commercialSubtypes: filters.commercialSubtypes,
    });

    const { areaMinSqft: min, areaMaxSqft: max } = filters;
    const fmt = (n: number) => n.toLocaleString('en-IN');
    let range: string;
    if (min != null && max != null) {
      range = `${fmt(min)} – ${fmt(max)} sq ft`;
    } else if (min != null) {
      range = `${fmt(min)}+ sq ft`;
    } else {
      range = `Up to ${fmt(max!)} sq ft`;
    }

    areaLabel =
      disclosure != null ? `${shortLabel}: ${range} — ${disclosure}` : `${shortLabel}: ${range}`;
  }

  // ── Build ordered filter-chip specs: booleans → value filters (design §5) ─
  const filterChips: ChipSpec[] = [];

  activeBooleans.forEach(({ key, label, testId }) => {
    filterChips.push({
      id: `bool-${key}`,
      icon: <span className="text-[10px] font-bold leading-none">✓</span>,
      label,
      onClear: () => onClearBoolean?.(key),
      testId,
      dismissTestId: `${testId}-dismiss`,
    });
  });

  if (hasSeller) {
    filterChips.push({
      id: 'seller',
      icon: <span className="text-[10px] font-bold leading-none">BY</span>,
      label: sellerLabel!,
      onClear: () => onClearSeller?.(),
      testId: 'chip-seller',
      dismissTestId: 'chip-seller-dismiss',
    });
  }

  if (hasDate) {
    filterChips.push({
      id: 'date',
      icon: <span className="text-[10px] font-bold leading-none">📅</span>,
      label: dateLabel!,
      onClear: () => onClearDateRange?.(),
      testId: 'chip-date',
      dismissTestId: 'chip-date-dismiss',
    });
  }

  if (hasType) {
    filterChips.push({
      id: 'type',
      icon: <span className="text-[10px] font-bold leading-none">TY</span>,
      label: typeLabel,
      onClear: onClearPropertyType,
      testId: 'chip-type',
    });
  }

  if (hasPrice) {
    filterChips.push({
      id: 'price',
      icon: <span className="text-[10px] font-bold leading-none">₹</span>,
      label: priceLabel,
      onClear: onClearPrice,
      testId: 'chip-price',
    });
  }

  if (hasArea) {
    filterChips.push({
      id: 'area',
      icon: <span className="text-[10px] font-bold leading-none">SQ</span>,
      label: areaLabel,
      onClear: () => onClearArea?.(),
      testId: 'chip-area',
      dismissTestId: 'chip-area-dismiss',
      // The ONLY caller that opts in. Every other chip on this bar keeps Chip's default
      // truncating behaviour, which is what keeps this a zero-blast-radius change to the
      // shared primitive rather than a restyle of the whole bar.
      wrap: true,
    });
  }

  if (hasBhk) {
    filterChips.push({
      id: 'bhk',
      icon: <span className="text-[10px] font-bold leading-none">BHK</span>,
      label: bhkLabel,
      onClear: onClearBhk,
      testId: 'chip-bhk',
    });
  }

  boardFilters.forEach((board) => {
    const key = board.toLowerCase();
    filterChips.push({
      id: `board-${key}`,
      icon: <span className="text-[10px] font-bold leading-none">B</span>,
      label: board,
      onClear: () => onClearBoard?.(board),
      testId: `active-chip-board-${key}`,
      dismissTestId: `active-chip-board-${key}-dismiss`,
    });
  });

  categoryFilters.forEach((category) => {
    const key = category.toLowerCase();
    filterChips.push({
      id: `category-${key}`,
      icon: <span className="text-[10px] font-bold leading-none">C</span>,
      label: category,
      onClear: () => onClearCategory?.(category),
      testId: `active-chip-category-${key}`,
      dismissTestId: `active-chip-category-${key}-dismiss`,
    });
  });

  if (!hasSearch && filterChips.length === 0) {
    return null;
  }

  const visibleFilterChips = filterChips.slice(0, MAX_VISIBLE_FILTER_CHIPS);
  const overflowFilterChips = filterChips.slice(MAX_VISIBLE_FILTER_CHIPS);
  const overflowCount = overflowFilterChips.length;

  // ── Roving focus (design §10): search → visible filter chips → +N → Clear all.
  const focusableCount =
    (hasSearch ? 1 : 0) + visibleFilterChips.length + (overflowCount > 0 ? 1 : 0) + (onClearAll ? 1 : 0);
  focusableRefs.current = focusableRefs.current.slice(0, focusableCount);
  const clampedRovingIndex = Math.min(rovingIndex, Math.max(focusableCount - 1, 0));

  const moveFocus = (delta: number) => {
    if (focusableCount === 0) return;
    const next = (clampedRovingIndex + delta + focusableCount) % focusableCount;
    setRovingIndex(next);
    focusableRefs.current[next]?.focus();
  };

  let cursor = -1;
  const nextIndex = () => ++cursor;

  return (
    <div
      role="group"
      aria-label="Active filters and search"
      className="flex flex-nowrap items-center gap-1.5 overflow-hidden"
      data-testid="active-context-chips"
    >
      {hasSearch &&
        (() => {
          const idx = nextIndex();
          return (
            <Chip
              id="search"
              icon={<Search className="h-3 w-3 flex-shrink-0" aria-hidden="true" />}
              label={`Search: "${truncateSearchLabel(searchTerm)}"`}
              onClear={() => onClearSearch?.()}
              testId="chip-search"
              dismissTestId="chip-search-dismiss"
              emphasis
              tabIndex={clampedRovingIndex === idx ? 0 : -1}
              onFocus={() => setRovingIndex(idx)}
              onArrow={moveFocus}
              chipRef={(el) => {
                focusableRefs.current[idx] = el;
              }}
            />
          );
        })()}

      {visibleFilterChips.map((chip) => {
        const idx = nextIndex();
        return (
          <Chip
            key={chip.id}
            {...chip}
            tabIndex={clampedRovingIndex === idx ? 0 : -1}
            onFocus={() => setRovingIndex(idx)}
            onArrow={moveFocus}
            chipRef={(el) => {
              focusableRefs.current[idx] = el;
            }}
          />
        );
      })}

      {overflowCount > 0 &&
        (() => {
          const idx = nextIndex();
          return (
            <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
              <PopoverTrigger asChild>
                <Button
                  ref={(el) => {
                    focusableRefs.current[idx] = el;
                  }}
                  variant="outline"
                  size="sm"
                  className="h-6 gap-0.5 rounded-full px-2 text-xs"
                  tabIndex={clampedRovingIndex === idx ? 0 : -1}
                  onFocus={() => setRovingIndex(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      moveFocus(1);
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      moveFocus(-1);
                    }
                  }}
                  aria-label={`Show ${overflowCount} more active filters`}
                  data-testid="active-chips-overflow-trigger"
                >
                  +{overflowCount}
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 p-2"
                data-testid="active-chips-overflow-popover"
                onCloseAutoFocus={(e) => {
                  // Radix default already returns focus to the trigger; keep it explicit
                  // so the "returns focus to +N on close" a11y contract (design §10) holds
                  // even if the trigger unmounts (overflow count drops to 0 on this render).
                  e.preventDefault();
                  focusableRefs.current[idx]?.focus();
                }}
              >
                <div className="flex flex-col gap-1.5">
                  {overflowFilterChips.map((chip, i) => (
                    <Chip
                      key={chip.id}
                      {...chip}
                      tabIndex={0}
                      onFocus={() => {}}
                      onArrow={(delta) => {
                        const el = overflowFilterChips[i + delta]?.id;
                        if (!el) return;
                      }}
                      chipRef={() => {}}
                    />
                  ))}
                  {onClearAll && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 justify-start px-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        onClearAll();
                        setOverflowOpen(false);
                      }}
                      aria-label="Clear all filters and search"
                    >
                      Clear all filters
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        })()}

      {onClearAll &&
        (() => {
          const idx = nextIndex();
          return (
            <Button
              ref={(el) => {
                focusableRefs.current[idx] = el;
              }}
              variant="link"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              tabIndex={clampedRovingIndex === idx ? 0 : -1}
              onFocus={() => setRovingIndex(idx)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  moveFocus(1);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  moveFocus(-1);
                }
              }}
              onClick={onClearAll}
              aria-label="Clear all filters and search"
              data-testid="active-chips-clear-all"
            >
              Clear all
            </Button>
          );
        })()}
    </div>
  );
}
