/**
 * PROPERTY_TYPE_VISUAL_MAP — canonical per-type visual config for map markers and legend.
 *
 * Colours are grounded in the ReTrends design source:
 *   navy    #26395B  (apartment)
 *   copper  #B05C3A  (villa / house — matches existing --copper token)
 *   evergreen #1F7A5C (land — matches existing --evergreen token)
 *   grey    #6B7280  (commercial / warehouse / other — neutral fallback)
 *
 * The icon field names reference lucide-react components but are stored here as
 * string glyph keys ('building' | 'home' | 'landplot') so that PropertyMap.tsx
 * can inline SVG paths in divIcon HTML without importing React into a raw-string
 * context. MapMarkerLegend uses the glyph key to select the right SVG path too.
 *
 * tintBg / tintFg / dotColour: used by MapMarkerLegend disc rendering if needed.
 * These shadow the existing CSS token tints for symmetry but are not required by all consumers.
 *
 * ── Issue #2430 — single buyer-facing label authority ────────────────────────
 * This module also owns the buyer-facing LABEL for every property type. Read it
 * via getPropertyTypeLabel() / getPropertyTypePluralLabel(); do not add another
 * per-component label map (four had accumulated before #2430, disagreeing with
 * each other on the whole Commercial family).
 *
 * NO-RESKIN INVARIANT: #2430 changed label strings only. Every key that existed
 * before it keeps its exact colour, glyph, tintBg and tintFg, and the two keys
 * it added (residential_plot, agricultural_land) carry precisely the grey values
 * they already resolved to through the fallback. Marker rendering therefore
 * cannot have shifted; propertyTypeConfig.test.ts pins this explicitly.
 *
 * The label strings are the ones issue #2430 pins. The Commercial buyer-design
 * issue (#2429) had not landed when this was written; when it does, the labels
 * are a one-place change in PROPERTY_TYPE_VISUAL_MAP / COMMERCIAL_SUBTYPE_LABELS.
 */
import {
  COMMERCIAL_TYPES,
  DISCOVER_COMMERCIAL_SUBTYPES,
  type CommercialSubtype,
} from '@/lib/listing-constants';

export type PropertyTypeGlyph = 'building' | 'home' | 'landplot';

export interface PropertyTypeVisual {
  colour: string;
  /**
   * Issue #2430 — the SINGULAR buyer-facing identity for this property type, and
   * the single label authority for every buyer Discover surface (result cards,
   * marker popover, mobile preview sheet, filter chips). Read it through
   * `getPropertyTypeLabel()` rather than reaching into this map, so that the
   * commercial-subtype refinement applies uniformly.
   *
   * Never 'Other' for a Commercial type: an unclassified or legacy-null
   * `commercial` row is labelled 'Commercial' — honest, and never a guessed
   * Shop/Office. See getPropertyTypeLabel for the subtype rules.
   */
  label: string;
  /**
   * Issue #2430 — the PLURAL form, for count contexts. Only MapMarkerLegend uses
   * it (its rows read "Apartments 12"). Kept in the same record as `label` so
   * both forms of a type's identity change in one place.
   */
  pluralLabel: string;
  glyph: PropertyTypeGlyph;
  tintBg: string;
  tintFg: string;
}

/**
 * Inline SVG path data for each glyph, sized for a 12×12 viewport.
 * Paths are simplified single-colour fills suitable for white-on-coloured-disc use.
 */
export const GLYPH_SVG_PATHS: Record<PropertyTypeGlyph, string> = {
  building:
    // Simplified Building2-style: two rectangles stacked (windows omitted for pixel clarity)
    'M2 12V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v8M0 12h12M4 7h1M7 7h1M4 9.5h1M7 9.5h1',
  home:
    // Home icon: roof triangle + door
    'M1 6L6 1l5 5M2 5.5V11a1 1 0 0 0 1 1h2V8h2v4h2a1 1 0 0 0 1-1V5.5',
  landplot:
    // LandPlot: boundary rectangle + tree/plant glyph
    'M1 10h10M1 10V2h10v8M4 7v3M8 7v3M4 7a2 2 0 0 1 4 0',
};

/**
 * Grey neutral shared by every type that has no dedicated colour of its own.
 * Issue #2430 relabels those types but deliberately does NOT recolour or
 * re-glyph any of them — see the module header's no-reskin note.
 */
const GREY_COLOUR = '#6B7280';
const GREY_TINT_BG = 'hsl(220 9% 92%)';
const GREY_TINT_FG = 'hsl(220 9% 46%)';

export const PROPERTY_TYPE_VISUAL_MAP: Record<string, PropertyTypeVisual> = {
  apartment: {
    colour: '#26395B',
    label: 'Apartment',
    pluralLabel: 'Apartments',
    glyph: 'building',
    tintBg: 'hsl(220 26% 93%)',  // --secondary (navy tint)
    tintFg: 'hsl(219 44% 19%)',  // --secondary-foreground
  },
  villa: {
    colour: '#B05C3A',
    label: 'Villa',
    pluralLabel: 'Villas',
    glyph: 'home',
    tintBg: 'hsl(25 39% 92%)',   // --copper-tint
    tintFg: 'hsl(18 51% 46%)',   // --copper
  },
  house: {
    colour: '#B05C3A',
    label: 'House',
    pluralLabel: 'Houses',
    glyph: 'home',
    tintBg: 'hsl(25 39% 92%)',
    tintFg: 'hsl(18 51% 46%)',
  },
  land: {
    colour: '#1F7A5C',
    // 'Land' — the string the result card, the marker popover and the mobile
    // preview sheet all already rendered, and the one PROPERTY_TYPES uses.
    // The filter chips said 'Plot / Land'; unifying on 'Land' moves one chip
    // rather than three listing surfaces.
    label: 'Land',
    // Preserved verbatim — this exact string is the legend's long-standing copy.
    pluralLabel: 'Plots / land',
    glyph: 'landplot',
    tintBg: 'hsl(156 25% 93%)',  // --evergreen-tint
    tintFg: 'hsl(160 60% 30%)',  // --evergreen
  },
  // Issue #2430 — `residential_plot` and `agricultural_land` are real
  // `PROPERTY_TYPES` values that were absent from this map, so they resolved to
  // the grey fallback and rendered as 'Other'. They are added here with the grey
  // visual they ALREADY resolve to today (identical colour, glyph and tints), so
  // the only change is the label. Giving either its own colour/glyph would be a
  // residential/agri visual change, which issue #2430 lists as a non-goal.
  residential_plot: {
    colour: GREY_COLOUR,
    label: 'Residential Plot',
    pluralLabel: 'Residential plots',
    glyph: 'building',
    tintBg: GREY_TINT_BG,
    tintFg: GREY_TINT_FG,
  },
  agricultural_land: {
    colour: GREY_COLOUR,
    label: 'Agricultural Land',
    pluralLabel: 'Agricultural land',
    glyph: 'building',
    tintBg: GREY_TINT_BG,
    tintFg: GREY_TINT_FG,
  },
  // ── Commercial family ──────────────────────────────────────────────────────
  // Issue #2430 — these four carried the label 'Other', which the map legend
  // rendered verbatim and which told a buyer nothing. Colours, glyphs and tints
  // are unchanged; only the labels move.
  commercial: {
    colour: GREY_COLOUR,
    // Generic commercial with no recorded subtype. Stays 'Commercial' — never
    // 'Other', and never a guessed Shop/Office (see getPropertyTypeLabel).
    label: 'Commercial',
    pluralLabel: 'Commercial',
    glyph: 'building',
    tintBg: GREY_TINT_BG,
    tintFg: GREY_TINT_FG,
  },
  commercial_building: {
    colour: GREY_COLOUR,
    label: 'Commercial Building',
    pluralLabel: 'Commercial buildings',
    glyph: 'building',
    tintBg: GREY_TINT_BG,
    tintFg: GREY_TINT_FG,
  },
  warehouse: {
    colour: GREY_COLOUR,
    label: 'Warehouse / Godown',
    pluralLabel: 'Warehouses / godowns',
    glyph: 'building',
    tintBg: GREY_TINT_BG,
    tintFg: GREY_TINT_FG,
  },
  commercial_land: {
    colour: GREY_COLOUR,
    label: 'Commercial Land',
    pluralLabel: 'Commercial land',
    glyph: 'landplot',
    tintBg: GREY_TINT_BG,
    tintFg: GREY_TINT_FG,
  },
  other: {
    colour: GREY_COLOUR,
    // Issue #2430 — 'Other' is a category name, not an identity a buyer can read
    // off a card pill. This entry is also the fallback for an unrecognised type,
    // so it doubles as the neutral last resort; 'Property' is the string
    // MarkerPopoverCard already used for exactly that case.
    label: 'Property',
    pluralLabel: 'Properties',
    glyph: 'building',
    tintBg: GREY_TINT_BG,
    tintFg: GREY_TINT_FG,
  },
};

/** Grey fallback for unknown / unlisted property types. */
const FALLBACK_VISUAL: PropertyTypeVisual = PROPERTY_TYPE_VISUAL_MAP['other'];

/**
 * Returns the visual config for the given property_type string.
 * Falls back to the neutral grey config for any unrecognised type.
 */
export function getPropertyTypeVisual(type: string): PropertyTypeVisual {
  return PROPERTY_TYPE_VISUAL_MAP[type] ?? FALLBACK_VISUAL;
}

/**
 * Issue #2430 — labels for a commercial listing whose subtype IS recorded.
 *
 * Keyed on the `CommercialSubtype` vocabulary the seller side already writes
 * (`lib/listingFieldConfig.ts`; option labels in `COMMERCIAL_SUBTYPE_OPTIONS`).
 * Each label keeps the word "Commercial" (or, for a warehouse, its own
 * unmistakable noun) because on a result card the type pill is frequently the
 * only Commercial signal present — a bare "Shop" there would read as a
 * different property family.
 *
 * BUILDING / WAREHOUSE / LAND are server-DERIVED from `property_type` rather
 * than sent explicitly, so in practice they arrive via the property_type arm
 * below; they are listed here so an explicitly-set value can never disagree
 * with the property_type label for the same listing.
 */
const COMMERCIAL_SUBTYPE_LABELS: Record<string, string> = {
  SHOP: 'Commercial Shop',
  OFFICE: 'Commercial Office',
  BUILDING: 'Commercial Building',
  WAREHOUSE: 'Warehouse / Godown',
  LAND: 'Commercial Land',
};

/**
 * Issue #2430 — filter-vocabulary aliases that are not `property_type` values.
 *
 * `plot` reaches the label path only from the Discover filter chips, whose URL
 * vocabulary carries it as a synonym for `land`. It is resolved HERE, in the
 * label functions, rather than added to PROPERTY_TYPE_VISUAL_MAP, so that no
 * marker or legend visual is affected by an alias that never identifies a real
 * listing row.
 */
const PROPERTY_TYPE_ALIASES: Record<string, string> = {
  plot: 'land',
};

function resolveTypeKey(type: string | null | undefined): string {
  const raw = (type ?? '').trim().toLowerCase();
  return PROPERTY_TYPE_ALIASES[raw] ?? raw;
}

/**
 * Issue #2430 — THE buyer-facing property-type label authority.
 *
 * Every buyer Discover surface (result cards, map legend via `pluralLabel`,
 * marker popover, mobile preview sheet, filter chips) resolves its label
 * through this function, so the same listing cannot read differently depending
 * on where the buyer looks. Do not add a per-component label map.
 *
 * `commercialSubtype` refines a commercial listing when — and only when — the
 * backend actually recorded one. It is optional because no buyer DTO carries
 * the field yet; the Commercial subtype-filter issue wires it through. Until
 * then every commercial row takes the honest `commercial` → "Commercial" path.
 *
 * Never guesses: an absent, blank or unrecognised subtype falls back to the
 * property type's own label rather than inventing a Shop/Office classification
 * the data does not support. Legacy rows migrated with a NULL subtype are
 * exactly this case.
 *
 * @param type              the listing's `property_type` (case-insensitive)
 * @param commercialSubtype the recorded subtype, when available
 */
export function getPropertyTypeLabel(
  type: string | null | undefined,
  commercialSubtype?: string | null,
): string {
  const typeKey = resolveTypeKey(type);

  if (COMMERCIAL_TYPES.has(typeKey)) {
    const subtypeKey = (commercialSubtype ?? '').trim().toUpperCase();
    const subtypeLabel = COMMERCIAL_SUBTYPE_LABELS[subtypeKey];
    if (subtypeLabel) return subtypeLabel;
  }

  return getPropertyTypeVisual(typeKey).label;
}

/**
 * Issue #2430 — plural counterpart of {@link getPropertyTypeLabel}, for the
 * count contexts the map legend renders ("Apartments 12"). Takes no subtype:
 * the legend groups by `property_type` only.
 */
export function getPropertyTypePluralLabel(type: string | null | undefined): string {
  return getPropertyTypeVisual(resolveTypeKey(type)).pluralLabel;
}

// ── Issue #2458 — canonical buyer subtype identity ───────────────────────────

/**
 * The five Commercial peers the approved #2429 buyer model exposes.
 *
 * Mirrors `DiscoverFilterNormalizer.ALLOWED_COMMERCIAL_SUBTYPES` on the server.
 * The two are held in step by the #2458 cross-language mapping parity test — a
 * Java authority and a TypeScript resolver are two implementations of ONE
 * mapping, which is unavoidable across the boundary and therefore pinned rather
 * than trusted.
 */
/**
 * Alias of the ONE vocabulary declaration, `DISCOVER_COMMERCIAL_SUBTYPES` in listing-constants.
 *
 * An earlier revision of #2458 declared a SECOND five-value literal here. That was the exact
 * cross-file drift this contract exists to prevent, reproduced inside it: two independent `as const`
 * arrays with nothing holding them in step, and a parity test that pinned TS against Java rather
 * than TS against TS — so one could move and the suite would stay green.
 *
 * Re-exporting the same binding makes that drift **structurally impossible** rather than
 * test-detectable, which is the stronger fix. The buyer-facing NAME is kept because the resolver
 * reads in the display direction and callers import it that way; it is an alias, not a copy.
 */
export const BUYER_COMMERCIAL_SUBTYPES = DISCOVER_COMMERCIAL_SUBTYPES;

export type BuyerCommercialSubtype = CommercialSubtype;

/**
 * The stored `property_type` each buyer peer lives in. Mirrors
 * `DiscoverFilterNormalizer.BUYER_SUBTYPE_TO_PROPERTY_TYPE`.
 *
 * SHOP and OFFICE both map to `commercial` because that is the one stored type
 * the subtype axis has to disambiguate; the other three are self-describing.
 */
export const BUYER_SUBTYPE_TO_PROPERTY_TYPE: Record<BuyerCommercialSubtype, string> = {
  SHOP: 'commercial',
  OFFICE: 'commercial',
  BUILDING: 'commercial_building',
  WAREHOUSE: 'warehouse',
  LAND: 'commercial_land',
};

/**
 * Resolves a row's two raw storage axes to the single buyer peer it belongs to
 * (#2458). The DISPLAY direction of the same mapping the Discover predicate uses
 * in the QUERY direction — one function, two directions, one declaration.
 *
 * Takes the RAW AXES, not a precomputed value, so any surface holding a row can
 * resolve it without needing the Discover DTO's `buyerCommercialSubtype`
 * projection. `ListingResponse` carries both axes today, so listing-detail and
 * broker surfaces can call this directly.
 *
 * ⚠️ **`null` is honest absence, never a guess**, and it carries TWO distinct
 * cases which the caller separates using `propertyType` — which is NOT NULL and
 * always correct:
 *
 *   - `propertyType === 'commercial'` with a null result → a LEGACY generic
 *     commercial row whose subtype was never recorded. Render the generic
 *     "Commercial" branch. V102 hardcodes NULL for every such row precisely
 *     because Shop vs Office cannot be recovered from legacy data.
 *   - any other `propertyType` with a null result → not a commercial row at all.
 *
 * Do NOT mint a sixth enum value to distinguish them: storage has no such value,
 * and inventing one would fabricate a distinction the data does not carry.
 *
 * ⚠️ **PRECONDITION — the two-case reading above holds ONLY if `commercialSubtype`
 * was actually FETCHED.** Passing `undefined` because a DTO omits the field is a
 * THIRD case this function cannot distinguish, and it degrades silently into the
 * first: a recorded Shop resolves to `null` and renders as a legacy row whose
 * subtype "was never recorded". That is a false claim about the DATA, made
 * confidently — the precise failure this resolver's honest-absence rule exists to
 * prevent, arriving through the caller rather than through storage.
 *
 * `AreaListingCard` (the anonymous `/api/discover/cities/{city}/listings` DTO) DOES
 * satisfy this precondition today: it carries `commercialSubtype` as of #2433, and
 * the allowlisted fact columns as of #2516.
 *
 * An earlier revision of this paragraph said that DTO carried `propertyType` but NOT
 * `commercialSubtype`, and told the reader not to "call this with a subtype the
 * surface never had". {@code PropertyCard} already calls it exactly that way, so the
 * instruction had come to forbid shipped, correct behaviour — worse than merely
 * stale, because it invites someone to "fix" working code.
 *
 * `PublicSchoolRadiusListingCard` (`/school-radius-listings`) remains the one feed
 * that genuinely cannot express a subtype, so it is the only surface where this
 * precondition still fails for `property_type='commercial'` rows. The three
 * self-describing types are unaffected there too, since they resolve from
 * `propertyType` alone.
 *
 * Legacy Building/Warehouse/Land rows carry NO subtype on any axis — V102
 * backfilled `listing_commercial_space_details` only for
 * `property_type = 'commercial'`. They still resolve correctly here, because the
 * property-type branch is consulted first and does not depend on the subtype.
 */
export function resolveBuyerCommercialSubtype(
  propertyType: string | null | undefined,
  commercialSubtype: string | null | undefined,
): BuyerCommercialSubtype | null {
  const type = propertyType?.trim().toLowerCase();
  if (!type) return null;

  // Self-describing types first: correct for legacy rows, which have no subtype
  // to consult on any axis.
  switch (type) {
    case 'commercial_building':
      return 'BUILDING';
    case 'warehouse':
      return 'WAREHOUSE';
    case 'commercial_land':
      return 'LAND';
    default:
      break;
  }

  // Only `commercial` is ambiguous, and only between SHOP and OFFICE.
  if (type !== 'commercial') return null;

  const subtype = commercialSubtype?.trim().toUpperCase();
  if (subtype === 'SHOP' || subtype === 'OFFICE') return subtype;

  // Legacy generic commercial: honest absence. Never inferred.
  return null;
}
