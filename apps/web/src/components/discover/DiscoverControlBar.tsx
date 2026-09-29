import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Map as MapIcon, MapPin, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDiscoverActions,
  useDiscoverNav,
  useDiscoverShell,
} from '@/features/discover/context/useDiscoverContext';
import { useDiscoverAreas, type DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { useDiscoverAreaNavigationPathResolver } from '@/features/discover/navigation/useDiscoverAreaNavigationPath';
import { useToast } from '@/hooks/use-toast';
import { useDiscoverSource } from '@/features/discover/state/DiscoverDataSourceContext';
import { IntentSelector } from './IntentSelector';

/**
 * Issue #1953 build step 5 — unified control bar (city + Buy/Rent + area
 * autocomplete). Consumes ONLY facade actions (useDiscoverNav/useDiscoverActions)
 * — this file must never reach around the facade for router state or the
 * deprecated low-level city setter. See DiscoverControlBar.facadeOnly.test.tsx
 * for the mechanical source-text gate that enforces this.
 *
 * Deliberately NOT built on the shadcn <Select> (Radix) primitive: Radix
 * Select's pointer-capture path needs jsdom polyfills to even open in tests
 * (see AgriculturalListingForm.test.tsx / CommercialListingForm.parity.test.tsx),
 * and this component needs a custom listbox anyway for the area autocomplete
 * (AC8). A single hand-rolled listbox pattern, reused for both dropdowns, is a
 * smaller surface than mixing Radix + custom.
 */

export interface ControlBarCity {
  key: string;
  label: string;
  active: boolean;
}

/**
 * Issue #1953 AC5 (post-launch fix) — the control bar is the SOLE owner of
 * city selection (the four panel-level CitySelects it replaced are gone), so
 * its roster of *selectable* cities MUST be derived from
 * lib/localityUtils's CITY_CONFIG — the actual set of cities with seeded
 * data/routing (udupi/kundapur/mangalore/bangalore) — rather than a second,
 * hand-maintained list. A parallel literal here is the two-sources-of-truth
 * bug that stranded /discover?city=udupi users on a raw slug with no way
 * back: the next city added to CITY_CONFIG must appear here automatically.
 * See DiscoverControlBar.test.tsx's "derived from CITY_CONFIG" describe
 * block for the regression guard.
 */
const CITY_CONFIG_CITIES: ControlBarCity[] = Object.entries(CITY_CONFIG).map(
  ([key, config]) => ({ key, label: config.label, active: true }),
);

/**
 * Declared placeholders — genuinely NOT in CITY_CONFIG (no seeded data yet).
 * Kept separate from CITY_CONFIG_CITIES above on purpose: these are a
 * product roadmap statement ("coming soon"), not a second source of truth
 * for which cities are reachable today.
 */
const COMING_SOON_CITIES: ControlBarCity[] = [
  { key: 'mumbai', label: 'Mumbai', active: false },
  { key: 'pune', label: 'Pune', active: false },
  { key: 'hyderabad', label: 'Hyderabad', active: false },
];

export const CONTROL_BAR_CITIES: ControlBarCity[] = [
  ...CITY_CONFIG_CITIES,
  ...COMING_SOON_CITIES,
];

const AREA_SEARCH_COPY: Record<DiscoverJourney, { label: string; placeholder: string }> = {
  'area-first': { label: 'Search areas to explore', placeholder: 'Search areas, localities or landmarks...' },
  'school-first': {
    label: 'Search areas near a school',
    placeholder: 'Search areas, localities or landmarks...',
  },
  'agri-first': {
    label: 'Search corridor or locality',
    placeholder: 'Search areas, localities or landmarks...',
  },
};

/** No journey active yet (landing) falls back to the area-first copy — it is
 * the default/primary journey (see JourneySwitcher's `primary: true` card). */
function resolveAreaSearchCopy(journey: DiscoverJourney | null) {
  return AREA_SEARCH_COPY[journey ?? 'area-first'];
}

/**
 * Issue #1953 FIX2 — the control bar's row lives inside an ancestor that can
 * clip absolutely-positioned children (MapDiscovery.tsx's control-bar-row
 * wrapper). An `absolute`-positioned dropdown inside a clipping ancestor is
 * cut off instead of floating above the page — that is why two evidence
 * screenshots named "city-switcher-open" showed no open menu. Both
 * dropdowns below portal their open listbox straight to `document.body`
 * and position it with `position: fixed` off a live measurement of their
 * own trigger element, so no ancestor's overflow can clip them. This hook
 * re-measures on open and on resize/scroll so the portal tracks the
 * trigger instead of drifting.
 */
function useTriggerRect(open: boolean, ref: React.RefObject<HTMLElement>) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const measure = () => setRect(ref.current?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, ref]);

  return rect;
}

// ─── City dropdown ───────────────────────────────────────────────────────

interface CityDropdownProps {
  cities: ControlBarCity[];
  selectedCity: string;
  onSelectCity: (city: ControlBarCity) => void;
  /** #2151 Track 1 — inert in an admin city-launch preview: the previewed city is fixed by
   * the route (cityId/revisionId), so switching city here would be meaningless/misleading. */
  disabled?: boolean;
  /** True only when the collapsed desktop header hosts this bar — protects this trigger's width in the tighter row. Defaults to false (matches main) for standalone/panel usage. */
  hostsHeaderControls?: boolean;
}

function CityDropdown({ cities, selectedCity, onSelectCity, disabled = false, hostsHeaderControls = false }: CityDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Issue #1953 FIX2 — the listbox below is portaled to document.body, so it
  // is no longer a DOM descendant of containerRef; the outside-click check
  // must also treat clicks inside the portaled listbox as "inside".
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const triggerRect = useTriggerRect(open, containerRef);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selected = cities.find((c) => c.key === selectedCity);

  return (
    <div ref={containerRef} className={cn('relative', hostsHeaderControls && 'shrink-0')} data-testid="control-bar-city-select">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={cn(
          'flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-foreground shadow-xs',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {selected?.label ?? selectedCity}
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>
      {!disabled && open &&
        createPortal(
          <ul
            ref={listboxRef}
            role="listbox"
            id={listboxId}
            aria-label="Select city"
            data-testid="control-bar-city-listbox"
            style={
              triggerRect
                ? { position: 'fixed', top: triggerRect.bottom + 6, left: triggerRect.left }
                : undefined
            }
            // Issue #1953 (occlusion sweep) — map-chrome overlays
            // (ExploreMapPanel, DiscoverMapContextOverlay, DiscoverMapLegend,
            // etc.) all sit at `z-[1000]`. This listbox is portaled to
            // `document.body` and positioned directly under the control
            // bar's leftmost trigger, which is right above the map's
            // top-left corner — exactly where those overlays anchor. A
            // portaled interactive popover must always win a hit-test
            // against static map chrome underneath it, so it is raised to
            // `z-[1100]`, matching the existing repo convention for this
            // same "floating control over map chrome" case (see
            // AddressPicker.tsx / AddressSearch.tsx / PoiManager.tsx, all
            // `z-[1100]`) rather than inventing a new value.
            className="z-[1100] w-48 rounded-lg border border-border bg-card py-1 shadow-lg"
          >
            {cities.map((city) => (
              <li key={city.key} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={city.key === selectedCity}
                  aria-disabled={!city.active}
                  disabled={!city.active}
                  data-testid={`control-bar-city-option-${city.key}`}
                  onClick={() => {
                    onSelectCity(city);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-3.5 py-2 text-left text-sm',
                    city.active
                      ? 'text-foreground hover:bg-muted'
                      : 'cursor-not-allowed text-muted-foreground/60',
                  )}
                >
                  {city.label}
                  {!city.active && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Soon
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}

// ─── Area autocomplete ───────────────────────────────────────────────────

export interface AreaAutocompleteProps {
  areas: DiscoverArea[];
  journey: DiscoverJourney | null;
  onSelectArea: (areaKey: string) => void;
  /** True only when the collapsed desktop header hosts this bar — applies the header-only min-width floor. Defaults to false (matches main) for standalone/panel usage. */
  hostsHeaderControls?: boolean;
  /**
   * Issue #2729 §1 — the committed area/hierarchy scope this search represents right now
   * (e.g. "Hebbal"), sourced by the caller from the SAME nav state the Results heading reads
   * (`nav.areaKey` via `useDiscoverAreas`), never a second lookup. Shown as the input's IDLE
   * value; undefined/null when no committed area applies (no misleading placeholder is invented
   * — the field simply falls back to the existing empty-placeholder behaviour).
   */
  canonicalAreaLabel?: string | null;
}

export function AreaAutocomplete({
  areas,
  journey,
  onSelectArea,
  hostsHeaderControls = false,
  canonicalAreaLabel = null,
}: AreaAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // Issue #2729 §1 — idle/draft/revert. IDLE (not editing): the input shows the committed
  // canonical scope, never a stale/misleading placeholder. Focusing starts a DRAFT (the typed
  // `query`); Escape/blur/outside-click without a selection discards the draft and falls back to
  // the canonical value again. Selecting a result is unaffected — `onSelectArea` below already
  // commits the new scope through the existing navigation path, and the NEXT render's
  // `canonicalAreaLabel` reflects it.
  //
  // Issue #2729 (post-merge fix-verify, BLOCKING) — this entire draft/revert behaviour is
  // gated on `hostsHeaderControls`: it is ONLY the header-hosted instance (the one mount site
  // that shows an idle canonical label at all — `canonicalAreaLabel` is always null at the other
  // two) that gets the new blur/Escape/idle-value semantics. At the panel-row (1024–1365) and
  // mobile-row instances, `draftEnabled` is false and every branch below collapses back to the
  // exact 3dd9e26f (pre-#2729) behaviour: `value` is always `query`, there is no `onBlur` handler
  // at all, and Escape only closes the listbox + refocuses — it never clears typed text.
  const draftEnabled = hostsHeaderControls;
  const [isEditing, setIsEditing] = useState(false);
  const displayValue = draftEnabled ? (isEditing ? query : (canonicalAreaLabel ?? '')) : query;
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Issue #1953 FIX2 — see the analogous ref in CityDropdown: the listbox
  // below is portaled to document.body, so the outside-click check must
  // also treat clicks inside the portaled listbox as "inside".
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const copy = resolveAreaSearchCopy(journey);
  const triggerRect = useTriggerRect(open, containerRef);

  const filteredAreas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return areas.filter((a) => (a.name || '').toLowerCase().includes(q)).slice(0, 8);
  }, [query, areas]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const closeAndRefocus = () => {
    setOpen(false);
    inputRef.current?.focus();
  };

  const commitSelection = (area: DiscoverArea) => {
    onSelectArea(area.areaKey);
    setQuery('');
    // Issue #2729 R2 fix — leaves draft mode on selection so the field shows the CANONICAL value
    // again (briefly the old one, until the async navigation resolves and `canonicalAreaLabel`
    // updates — never blank). Previously `isEditing` stayed true after a commit, so the field
    // showed an empty draft indefinitely even though a real selection had just been made.
    // Gated on `draftEnabled` (see its doc above) — `isEditing` is display-inert at the other two
    // mount sites, but setting it unconditionally would still be a needless divergence from base.
    if (draftEnabled) setIsEditing(false);
    closeAndRefocus();
  };

  // Issue #2729 §1 — discards an abandoned draft and returns the field to the canonical value.
  // Shared by blur, outside-click (native blur already fires there) and Escape, so all three
  // "abandon" paths agree on one behaviour instead of drifting apart. ONLY wired up (via `onBlur`
  // below, and the `draftEnabled` branch of Escape) at the header-hosted instance — see
  // `draftEnabled`'s doc above.
  const revertDraft = () => {
    setOpen(false);
    setIsEditing(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (filteredAreas.length === 0) return;
      setHighlightedIndex((i) => (i + 1) % filteredAreas.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredAreas.length === 0) return;
      setHighlightedIndex((i) => (i - 1 + filteredAreas.length) % filteredAreas.length);
    } else if (e.key === 'Enter') {
      if (!open || filteredAreas.length === 0) return;
      e.preventDefault();
      const area = filteredAreas[highlightedIndex];
      if (area) commitSelection(area);
    } else if (e.key === 'Escape') {
      // Issue #2729 (post-merge fix-verify, BLOCKING) — gated on `draftEnabled`. At the
      // header-hosted instance, Escape now ABANDONS the draft: `revertDraft` flips `isEditing`
      // back to false (so the field shows the canonical value again) and clears the typed text.
      // At the other two mount sites this must behave EXACTLY as 3dd9e26f: Escape only closes
      // the listbox and refocuses (via `closeAndRefocus`) — it never touches `query`, so typed
      // text survives Escape there, matching pre-#2729 behaviour byte-for-byte.
      if (draftEnabled) {
        if (open || query) {
          e.preventDefault();
          // The pre-#2729 AC8 contract ("Escape closes the listbox and returns focus to the
          // input") still holds unchanged — focus was never taken away in the first place here,
          // so there is nothing to refocus; only `closeAndRefocus`'s redundant `.focus()` call
          // is gone.
          revertDraft();
        }
      } else if (open) {
        e.preventDefault();
        closeAndRefocus();
      }
    }
  };

  const activeOptionId =
    open && filteredAreas.length > 0 ? `${listboxId}-option-${highlightedIndex}` : undefined;

  return (
    <div
      ref={containerRef}
      // Issue #1953 FIX1 — full width on its own wrapped line at <lg widths
      // (see DiscoverControlBar's outer flex-wrap row); back to flex-1 inline
      // alongside city/Buy-Rent/trigger at lg+.
      className={cn(
        'relative w-full lg:w-auto lg:flex-1',
        // Header-only min-width floor keeps the search input legible in the tighter collapsed desktop header row; unset elsewhere so this matches main exactly.
        hostsHeaderControls && 'lg:min-w-[280px]',
      )}
      data-testid="control-bar-area-autocomplete"
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-label={copy.label}
          placeholder={copy.placeholder}
          data-testid="control-bar-area-input"
          data-editing={draftEnabled && isEditing ? true : undefined}
          value={displayValue}
          onChange={(e) => {
            if (draftEnabled) setIsEditing(true);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            // Issue #2729 §1 — focusing always starts a fresh draft; the canonical value shown
            // while idle is not itself an editable query (typing after focus searches from
            // scratch, exactly like the pre-#2729 empty-idle behaviour). Gated on `draftEnabled`
            // — see its doc above.
            if (draftEnabled) setIsEditing(true);
            if (query.trim()) setOpen(true);
          }}
          // Issue #2729 (post-merge fix-verify, BLOCKING) — `onBlur` is ONLY wired up at the
          // header-hosted instance. At the other two mount sites there must be NO blur handler at
          // all, matching 3dd9e26f exactly — `revertDraft` clears `query`, which would otherwise
          // wipe a typed-but-not-yet-selected search below the 1366 invariant.
          onBlur={draftEnabled ? revertDraft : undefined}
          onKeyDown={handleKeyDown}
          className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {(draftEnabled ? isEditing : true) && query && (
          <button
            type="button"
            aria-label="Clear area search"
            data-testid="control-bar-area-clear"
            // Issue #2729 §1 — without this, the button's own mousedown blurs the input FIRST
            // (native focus-move-on-mousedown), which would fire `revertDraft` and wipe the
            // draft this button is trying to only partially clear. Gated on `draftEnabled` —
            // there is no `onBlur` handler at all at the other two mount sites (see its doc
            // above), so this guard is only meaningful, and only added, where that handler
            // exists.
            onMouseDown={draftEnabled ? (e) => e.preventDefault() : undefined}
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {open &&
        query.trim() &&
        createPortal(
          <ul
            ref={listboxRef}
            role="listbox"
            id={listboxId}
            aria-label={copy.label}
            data-testid="control-bar-area-listbox"
            style={
              triggerRect
                ? {
                    position: 'fixed',
                    top: triggerRect.bottom + 6,
                    left: triggerRect.left,
                    width: triggerRect.width,
                  }
                : undefined
            }
            // Issue #1953 (occlusion sweep) — same reasoning as
            // CityDropdown's listbox above: raised above map-chrome
            // overlays' `z-[1000]` so this portaled popover always wins the
            // hit-test, matching the repo's existing `z-[1100]` convention
            // for floating controls over the map (AddressPicker.tsx /
            // AddressSearch.tsx / PoiManager.tsx).
            className="z-[1100] max-h-72 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg"
          >
            {filteredAreas.length === 0 ? (
              <li
                role="status"
                data-testid="control-bar-area-no-results"
                className="px-3.5 py-3 text-xs text-muted-foreground"
              >
                No areas match “{query.trim()}”.
              </li>
            ) : (
              filteredAreas.map((area, index) => (
                <li key={area.areaKey} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`${listboxId}-option-${index}`}
                    aria-selected={index === highlightedIndex}
                    data-testid={`control-bar-area-option-${area.areaKey}`}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    // Issue #2729 §1 — see the clear button's identical guard: without this the
                    // option's own mousedown blurs (and reverts) the input before its click fires,
                    // and `revertDraft` closing the listbox on blur would drop the click entirely.
                    // Gated on `draftEnabled` — same reasoning as the clear button above.
                    onMouseDown={draftEnabled ? (e) => e.preventDefault() : undefined}
                    onClick={() => commitSelection(area)}
                    className={cn(
                      'flex w-full items-center justify-between px-3.5 py-2 text-left text-sm text-foreground',
                      index === highlightedIndex && 'bg-muted',
                    )}
                  >
                    {area.name}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}

// ─── Composed control bar ────────────────────────────────────────────────

export interface DiscoverControlBarProps {
  /**
   * Issue #1953 FIX1 — the mobile List<->Map trigger, rendered as a flex
   * sibling INSIDE the control bar's row instead of a page-level `fixed`
   * button. A flex child cannot overlap its siblings, which eliminates the
   * collision class entirely rather than moving the trigger to whichever
   * corner happens to be empty today (which is exactly what caused the
   * regression this fixes — the trigger was relocated to top-right to
   * dodge the telemetry consent banner, then this control bar was mounted
   * into that same space). Omit entirely on desktop or while the mobile Map
   * overlay is already open — MapDiscovery.tsx only passes this when
   * `isMobileShell && !mobileMapOpen`.
   */
  mobileMapTrigger?: {
    onOpenMap: () => void;
    /** Forwarded to useMobileMapOverlayShell so focus returns here on close. */
    triggerRef?: React.Ref<HTMLButtonElement>;
  };
  /**
   * True only when the collapsed desktop header hosts this bar — threaded from
   * the single computed source (useDiscoverPageContext.ts's `hostsHeaderControls`)
   * via each mount site (PublicHeader, RightPanelFrame, DiscoverJourneyPanelShell),
   * rather than this component deriving it itself with its own
   * `useDiscoverHeaderHostsControls` call — every OTHER consumer of that boolean
   * already reads the single threaded value, and this was the one remaining
   * self-fetch. Defaults to `false` (matches main) for a mount site that only
   * ever renders below the threshold (DiscoverPageShell's mobile row) and for
   * standalone/test usage.
   */
  hostsHeaderControls?: boolean;
}

export function DiscoverControlBar({ mobileMapTrigger, hostsHeaderControls = false }: DiscoverControlBarProps = {}) {
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  // Node-only URL (no `city=` param) leaves nav.city === '', which would
  // silently disable this fetch — fall back to the established
  // `nav.city || DEFAULT_CITY` idiom.
  const { data } = useDiscoverAreas(nav.city || DEFAULT_CITY);
  const areas = data?.areas ?? [];
  // Issue #2729 §1 (D1/R1 fix) — the FIRST-priority source is
  // `DiscoverShellContextValue.canonicalScopeLabel`, the EXACT string `AreaSelectedPanel`
  // broadcasts as the SAME value the Results heading is rendering right now ("Properties in
  // {this}", or the joined AREA_SET names). This replaces an earlier, WRONG attempt that
  // independently re-derived the label from `nav.resultScope` (the committed `rscope`/`rareas`
  // result-scope payload): round-2 browser verification found that param can be STALE relative to
  // the current hierarchy position (`node=`) — e.g. after picking a new area from this very
  // search, `node` moves but the committed result-scope payload does not, until a fresh commit —
  // so the title (which follows `node`) and the search (which followed `resultScope`) visibly
  // disagreed. Reading the panel's own broadcast instead of a second, independent URL-param
  // derivation is what makes them structurally unable to disagree, whichever URL field ends up
  // authoritative for the title in a given state; a PRE-EXISTING staleness in the underlying
  // `rareas` param itself (the title being "wrong" relative to the intended scope) is unaffected
  // by this and out of scope here (flagged separately, not silently fixed).
  //
  // `null` whenever no `AreaSelectedPanel` is mounted (school-first/agri-first/journey-less/
  // landing) — the shell field itself is `null` there, so the search correctly falls back to its
  // placeholder with no separate journey check needed here any more.
  //
  // Issue #2729 P1 fix (pre-push reviewer, BLOCKING) — `hostsHeaderControls` gates this too.
  // `AreaSelectedPanel` broadcasts `canonicalScopeLabel` UNCONDITIONALLY (correctly — it doesn't
  // know or care which of this control bar's THREE mount sites is active), but this component
  // itself also mounts below the desktop-reskin floor: the 1024–1365 panel row
  // (`DiscoverJourneyPanelShell.tsx`) and the mobile row (`DiscoverPageShell.tsx`), both with
  // `hostsHeaderControls=false`. Reading the broadcast unconditionally leaked the idle canonical
  // label into those two rows, which the issue requires to stay byte-for-byte unchanged below
  // 1366. Only the header-hosted instance (`hostsHeaderControls=true`, the ONE mount site that
  // actually replaces the old two-row layout with the compact single-row header) shows it.
  const shell = useDiscoverShell();
  const canonicalAreaLabel = hostsHeaderControls ? shell.canonicalScopeLabel : null;
  const { toast } = useToast();
  // Issue #1956 PR 6 ([rulings.option_a_search_convergence_2026_08_03]) — the
  // in-app area-search control used to write the legacy `areaKey=` param
  // directly (`actions.selectArea`), which the canonical `journey=area-first`
  // panel never reads: the map camera would move but the panel stayed on the
  // city-root Direction cards. This resolves the selected stable areaKey
  // through the SAME sanctioned server path (`.../navigation-path`) and the
  // SAME atomic writer (`enterAreasJourney`) the JourneySwitcher conversion
  // seam already uses (DiscoverRightPanelContainer.tsx's `handleSelectJourney`)
  // — never a client-constructed node key, never a second resolution path.
  const resolveAreaNavigationPath = useDiscoverAreaNavigationPathResolver();
  // #2151 Track 1 — the city switcher is inert in an admin city-launch preview: the
  // previewed city is fixed by the route, not user-selectable.
  const citySwitcherDisabled = useDiscoverSource().mode === 'preview';
  // When the header hosts this bar it owns naming via its own aria-label; otherwise (mobile, or narrow desktop where the panel renders it) the visible label matches main.

  const handleSelectCity = (city: ControlBarCity) => {
    if (citySwitcherDisabled) return;
    if (!city.active) return;
    if (city.key === nav.city) return;
    actions.changeCity(city.key);
  };

  const handleSelectArea = (areaKey: string) => {
    // Issue #2203 (Option A') — this control bar is SHARED across
    // area-first, school-first, agri-first, AND the journey-less landing
    // (nav.journey === null before any journey is picked). The original
    // three-way split here (PR review rework, rework-request-pr-review-3.toml)
    // routed school-first/agri-first/journey-less all through the SAME
    // `actions.selectArea` branch alongside journey-less — that was correct
    // for journey-less (out of scope, deferred to #2059's journey-less
    // convergence) but left school-first/agri-first area-search unable to
    // preserve a resolved canonical node like area-first can.
    //
    // Journey-less landing keeps its EXACT pre-existing behaviour — the
    // [rulings.oq_a] A1 MINIMAL ruling explicitly keeps journey-less
    // convergence out of scope (deferred to #2059), and the adjacent copy
    // fallback (resolveAreaSearchCopy) treating null as area-first is
    // display-only text, never behaviour.
    if (nav.journey === null) {
      actions.selectArea(areaKey);
      return;
    }

    // Every journeyed case (area-first, school-first, agri-first) now
    // resolves the picked areaKey through the SAME sanctioned server path
    // (`.../navigation-path`) area-first already used — never a
    // client-constructed node key, never a second resolution path. A
    // resolution already in flight for a prior selection is never
    // superseded by a second concurrent request/history write (mirrors
    // handleSelectJourney's same guard for the JourneySwitcher conversion
    // seam).
    if (resolveAreaNavigationPath.isPending) return;
    resolveAreaNavigationPath.mutate(
      { city: nav.city, areaKey },
      {
        onSuccess: (path) => {
          // area-first: camera and panel move together via enterAreasJourney
          // — the same atomic writer guided hierarchy selection uses. The
          // legacy `areaKey=`/`groupId=` params are never written in the
          // first place, so there is nothing obsolete left to clear.
          //
          // school-first/agri-first: `journey` is NEVER converted to
          // area-first — that would eject the user out of the journey they
          // are in, which is exactly the cross-journey-ejection regression
          // the school-first/agri-first branch below `enterAreasJourney`
          // used to guard against. Instead the resolved node is written via
          // a journey-preserving action that ALSO clears the
          // geography-dependent leaf selection the just-left Area owned
          // (school-first: `schoolId`; agri-first: the destKey-based
          // `selectedLocality`) in the SAME atomic write — a new Area no
          // longer implies the previously-selected school/locality is still
          // valid. `selectedRegion`/`selectedMaxKm` (agri-first's corridor +
          // radius) are untouched — those remain meaningful across an Area
          // change within the same corridor.
          if (nav.journey === 'area-first') {
            actions.enterAreasJourney(path.nodeKey);
          } else if (nav.journey === 'school-first') {
            actions.goToNodeAndClearSchoolSelection(path.nodeKey);
          } else {
            actions.goToNodeAndClearAgriculturalLocality(path.nodeKey);
          }
        },
        onError: () => {
          // Failure: preserve the current canonical state untouched (no
          // camera move, no panel strand at city root — that split IS the
          // defect this fix closes) and use the existing non-destructive
          // stale-link toast-and-stay treatment.
          toast({
            variant: 'destructive',
            title: "Couldn't open that area",
            description: 'This area link looks out of date. Staying on your current view.',
          });
        },
      },
    );
  };

  return (
    <div
      // Issue #1953 FIX1 — wraps onto a second line at <lg widths instead of
      // overflowing horizontally: AreaAutocomplete below is `w-full` at
      // these widths, which (given flex-wrap) cannot fit on the same line
      // as city + Buy/Rent + the map trigger, so it always drops to its own
      // line rather than being clipped or scrolled off. `lg:flex-nowrap`
      // restores the original single-line desktop layout unchanged.
      className={cn(
        'flex flex-wrap items-center gap-2 lg:flex-nowrap',
        // Header-only tighter gap (matches step 1 of the compression order); unset elsewhere so this matches main's `lg:gap-3` exactly.
        hostsHeaderControls ? 'lg:gap-2' : 'lg:gap-3',
      )}
      data-testid="discover-control-bar"
    >
      <CityDropdown
        cities={CONTROL_BAR_CITIES}
        selectedCity={nav.city}
        onSelectCity={handleSelectCity}
        disabled={citySwitcherDisabled}
        hostsHeaderControls={hostsHeaderControls}
      />
      {/* Distinct testId to avoid colliding with per-panel IntentSelector instances; label hidden only when the header hosts this bar (its own aria-label already names it there) — otherwise matches main's "hidden lg:inline". */}
      <IntentSelector
        intent={nav.intent}
        onIntentChange={actions.setIntent}
        testId="control-bar-intent-selector"
        labelClassName={hostsHeaderControls ? 'hidden' : 'hidden lg:inline'}
        className={hostsHeaderControls ? 'shrink-0' : undefined}
      />
      {mobileMapTrigger && (
        // Issue #2408 AC — the mock's Map/List control is a segmented
        // "List | Map" pill (both labels always visible, the active one
        // highlighted), not a standalone circular Map icon button. This
        // control bar only ever renders while in LIST presentation (the
        // trigger prop is omitted entirely once mobileMapOpen — see the
        // prop doc above), so "List" is always the active segment here;
        // the mirrored "Map"-active pill lives in buildMapSurfaceModel.tsx's
        // mobileListButton, which renders once the overlay is open. Same
        // testid/aria-label/onClick/ref as before — this is a visual
        // restyle, not a behavior change — so the existing List<->Map
        // e2e/unit coverage keeps working unchanged.
        <div
          role="group"
          aria-label="List or Map view"
          className="flex h-11 shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted p-0.5 lg:hidden"
        >
          <span
            aria-hidden="true"
            className="flex h-full items-center rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground"
          >
            List
          </span>
          <button
            ref={mobileMapTrigger.triggerRef}
            type="button"
            onClick={mobileMapTrigger.onOpenMap}
            aria-label="Map"
            data-testid="control-bar-map-trigger"
            className="flex h-full items-center gap-1 rounded-full px-3 text-xs font-bold text-muted-foreground"
          >
            <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Map
          </button>
        </div>
      )}
      <AreaAutocomplete
        areas={areas}
        journey={nav.journey}
        onSelectArea={handleSelectArea}
        hostsHeaderControls={hostsHeaderControls}
        canonicalAreaLabel={canonicalAreaLabel}
      />
    </div>
  );
}
