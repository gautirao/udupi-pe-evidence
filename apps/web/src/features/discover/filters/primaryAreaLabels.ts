/**
 * Issue #2459 Step 1 (frontend half) — what "area" MEANS for a Discover selection, and the
 * buyer-facing label + disclosure that say so out loud.
 *
 * One numeric sq-ft range control spans property shapes whose areas are not the same quantity.
 * 1,200 sq ft of an apartment is its BUILT-UP area; 1,200 sq ft of a plot is the LAND it sits on.
 * The server resolves that meaning PER ROW (see `DiscoverPrimaryArea.java`, which owns the
 * predicate). This module owns only the DISPLAY side of the same contract: given what the buyer
 * has selected, which meaning(s) are in play, what does the control call itself, and — when more
 * than one meaning is in play — what does it disclose about the mixture.
 *
 * ## The disclosure is an acceptance criterion, not copy
 *
 * #2459's D1 ruling: "per-row truthful primary area, meaning DISCLOSED in label and chip …
 * Disclosure is NOT optional." A broad or mixed selection whose rows are measured on different
 * quantities and does not say so is dishonest, however correct its predicate. That is why the
 * disclosure is modelled as DATA here ({@link PRIMARY_AREA_DISCLOSURE_TERMS}) rather than
 * hardcoded in whichever component happens to render it: a second rendering site cannot drift
 * from the first, and the sentence is assertable in a unit test without mounting a panel.
 *
 * ## Carpet area is deliberately absent
 *
 * There is no CARPET meaning, by owner ruling on AC1 — 0 of 1,916 LIVE dwellings carry a
 * `carpet_area` value, while `built_area` covers 1,641 of 1,650 live apartments. Do NOT add one
 * to "restore parity" with the #2429 label table; the deviation is deliberate and approved.
 *
 * ## This module renders nothing
 *
 * It is pure data + pure functions. The control and the selected-filter chip that consume it are
 * owned by a separate slice (#2450) and are deliberately not wired here.
 */
import {
  COMMERCIAL_TYPES,
  DISCOVER_COMMERCIAL_SUBTYPES,
  PROPERTY_TYPES,
  SUBTYPE_BEARING_PROPERTY_TYPE,
} from '@/lib/listing-constants';
import { resolveBuyerCommercialSubtype } from '@/lib/propertyTypeConfig';

/**
 * The primary-area meanings, mirroring the server enum `DiscoverPrimaryArea` value-for-value.
 * `UNRESOLVED` is a real answer, not an error: such rows have no primary area, stay visible under
 * "Any size", and are honestly excluded the moment a bound is active.
 */
export type PrimaryAreaMeaning = 'BUILT_UP' | 'PLOT' | 'WAREHOUSE' | 'UNRESOLVED';

/** A meaning that actually names a quantity — i.e. everything except `UNRESOLVED`. */
export type ResolvedPrimaryAreaMeaning = Exclude<PrimaryAreaMeaning, 'UNRESOLVED'>;

/**
 * Canonical order for every list this module emits (meanings in play, disclosure clauses). Fixed
 * rather than selection-order so the same selection always produces byte-identical copy.
 */
const MEANING_ORDER: readonly ResolvedPrimaryAreaMeaning[] = ['BUILT_UP', 'WAREHOUSE', 'PLOT'];

/**
 * The disclosed label for a selection resolving to exactly ONE meaning. Byte-identical to
 * `DiscoverPrimaryArea.buyerLabel()` on the server — the same words the predicate is written
 * against, so the control cannot promise a quantity the WHERE clause does not filter on.
 */
export const PRIMARY_AREA_LABELS: Record<ResolvedPrimaryAreaMeaning, string> = {
  BUILT_UP: 'BUILT-UP AREA (SQ FT)',
  PLOT: 'PLOT SIZE (SQ FT)',
  WAREHOUSE: 'WAREHOUSE AREA (SQ FT)',
};

/**
 * The label for a broad/mixed selection — one whose rows resolve to MORE THAN ONE meaning. It is
 * deliberately non-committal, because no single quantity name would be true of every row. The
 * missing specificity is supplied by the disclosure, which is why a mixed label must never be
 * shown without one.
 */
export const BROAD_PRIMARY_AREA_LABEL = 'AREA (SQ FT)';

/**
 * How each meaning is NAMED inside a disclosure sentence — lower-case prose, not the shouted
 * control label. Separate from {@link PRIMARY_AREA_LABELS} because the two read in different
 * grammatical positions; collapsing them would force a case transform at every call site.
 */
export const PRIMARY_AREA_QUANTITY: Record<ResolvedPrimaryAreaMeaning, string> = {
  BUILT_UP: 'built-up area',
  PLOT: 'plot size',
  WAREHOUSE: 'warehouse area',
};

/**
 * CANONICAL SHORT FORMS of {@link PRIMARY_AREA_QUANTITY} — the same taxonomy with the redundant
 * head noun dropped, for the one position where width is scarce: several quantities named at once.
 *
 * These exist because the chip's visible span is `max-w-[160px] truncate` (`Chip.tsx`), roughly
 * two dozen characters. Spelling three long quantities into it produced
 * "Built-up area / warehous" for BOTH a Commercial-broad selection and the broadest selection —
 * two materially different filter states rendering IDENTICALLY, which is the failure AC6 exists to
 * prevent. The fix belongs here rather than at a call site: a component that coined its own
 * abbreviation would be a second declaration of this vocabulary, free to drift from the first.
 *
 * They are a VISIBLE-LAYER concern only. Nothing built from them replaces the full wording in an
 * accessible name — see {@link PrimaryAreaControlLabel.shortLabel}, which is always accompanied by
 * the full quantity names (via the disclosure) in the string a screen reader announces.
 */
export const PRIMARY_AREA_QUANTITY_SHORT: Record<ResolvedPrimaryAreaMeaning, string> = {
  BUILT_UP: 'built-up',
  PLOT: 'plot',
  WAREHOUSE: 'warehouse',
};

/** The buyer-facing families a selection can span. Drives which disclosure subjects apply. */
export type PrimaryAreaFamily = 'residential' | 'commercial' | 'agricultural';

const FAMILY_ORDER: readonly PrimaryAreaFamily[] = ['residential', 'commercial', 'agricultural'];

/**
 * The scope word that LEADS a multi-meaning short label. Naming the family is what separates
 * "every Commercial shape" from "every shape there is": both span built-up + warehouse + plot, so
 * the meanings alone cannot tell them apart, and the disclosure that does is far past the visible
 * cut-off. The scope leads rather than trails for exactly that reason — a trailing qualifier is
 * the first thing `truncate` eats.
 */
export const PRIMARY_AREA_SCOPE_SHORT: Record<PrimaryAreaFamily, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  agricultural: 'Agricultural',
};

/**
 * The scope word for a selection spanning MORE THAN ONE family. Deliberately not "All types": a
 * two-family mixture (say homes + warehouses) is not everything, and a scope word that overclaims
 * is the same dishonesty as a label that underclaims.
 */
export const MIXED_SCOPE_SHORT = 'Mixed';

/**
 * The short label for a selection where NOTHING resolves to a quantity (`other` alone). There is
 * no honest quantity to name, so the generic word is the truthful answer, not a fallback.
 */
export const UNNAMED_AREA_SHORT_LABEL = 'Area';

/**
 * One clause of a disclosure: a quantity ({@link PRIMARY_AREA_QUANTITY}) and the buyer words for
 * what it is measured ON. Keyed by family because the same meaning has a different subject in
 * each — BUILT_UP is "homes" to a residential shopper and "shops, offices and commercial
 * buildings" to a commercial one.
 */
export interface PrimaryAreaDisclosureTerm {
  meaning: ResolvedPrimaryAreaMeaning;
  /** What the quantity is measured on, in buyer words (e.g. "homes", "warehouses and godowns"). */
  subject: string;
}

/**
 * THE disclosure vocabulary. The D1 ruling names exactly these mixtures:
 * "Residential broad = built-up for homes, plot size for plots; Commercial broad =
 * built-up/warehouse/plot size by subtype."
 *
 * Listed per family in the order their clauses should read. A clause is emitted only when its
 * meaning is actually in play for that family, so a partial selection discloses a partial —
 * and still truthful — sentence.
 */
export const PRIMARY_AREA_DISCLOSURE_TERMS: Record<
  PrimaryAreaFamily,
  readonly PrimaryAreaDisclosureTerm[]
> = {
  residential: [
    { meaning: 'BUILT_UP', subject: 'homes' },
    { meaning: 'PLOT', subject: 'plots' },
  ],
  commercial: [
    { meaning: 'BUILT_UP', subject: 'shops, offices and commercial buildings' },
    { meaning: 'WAREHOUSE', subject: 'warehouses and godowns' },
    { meaning: 'PLOT', subject: 'commercial land' },
  ],
  agricultural: [{ meaning: 'PLOT', subject: 'agricultural land' }],
};

// ── Resolution ────────────────────────────────────────────────────────────────────────────────

/**
 * Buyer commercial subtype → meaning. Mirrors `DiscoverPrimaryArea.MEANING_BY_SUBTYPE`, keyed on
 * the #2458 buyer vocabulary (SHOP/OFFICE/BUILDING/WAREHOUSE/LAND).
 */
const MEANING_BY_SUBTYPE: Readonly<Record<string, ResolvedPrimaryAreaMeaning>> = {
  SHOP: 'BUILT_UP',
  OFFICE: 'BUILT_UP',
  BUILDING: 'BUILT_UP',
  WAREHOUSE: 'WAREHOUSE',
  LAND: 'PLOT',
};

/**
 * Non-commercial stored `property_type` → meaning. Mirrors
 * `DiscoverPrimaryArea.MEANING_BY_PROPERTY_TYPE`. The commercial types are ABSENT on purpose:
 * they resolve through {@link ADMISSIBLE_SUBTYPES} and the convergence rule below, so this map
 * does not restate the Commercial taxonomy.
 *
 * ⚠️ An earlier revision of this comment claimed listing them here would give the Commercial
 * taxonomy "a second declaration". That was true when written and FALSE by the time the merged
 * tree carried `contracts/commercial-subtype-mapping.json`: `ADMISSIBLE_SUBTYPES` below was by
 * then a third, hand-written one, sitting outside that contract. It is now derived from the
 * contract-pinned resolver, which is what makes the claim true again — so the sentence is stated
 * as what this map does, not as a count that goes stale the next time one is added elsewhere.
 *
 * `other` is absent on purpose and therefore UNRESOLVED — nothing bounds what such a row is.
 */
const MEANING_BY_PROPERTY_TYPE: Readonly<Record<string, ResolvedPrimaryAreaMeaning>> = {
  apartment: 'BUILT_UP',
  villa: 'BUILT_UP',
  house: 'BUILT_UP',
  residential_plot: 'PLOT',
  land: 'PLOT',
  agricultural_land: 'PLOT',
};

/**
 * The buyer subtypes a stored commercial `property_type` could admissibly be — DERIVED, never
 * hand-written. Only `commercial` is genuinely ambiguous (SHOP or OFFICE); the rest are
 * self-describing under #2458 and invert to exactly one subtype.
 *
 * ## Why this is computed rather than listed
 *
 * The values below are the INVERSE of `resolveBuyerCommercialSubtype` — a subtype is admissible
 * for a type exactly when resolving that pair gives the subtype back. That resolver is the one
 * pinned across the language boundary by `contracts/commercial-subtype-mapping.json`, which both
 * this repo's TypeScript suite and the Java `DiscoverListingsService` twin assert against.
 * Inverting it is how `DiscoverPrimaryArea.admissibleSubtypes` derives the same table on the
 * server, so the two sides self-heal together.
 *
 * A hand-written literal here would be a THIRD declaration of the Commercial taxonomy, sitting
 * OUTSIDE that contract with no parity test of its own — correct today, and silently wrong the
 * first time the mapping changes. It was one, and this is the removal of it: the fix is deleting
 * a declaration, not adding a test to guard one.
 *
 * The subtype ORDER follows `DISCOVER_COMMERCIAL_SUBTYPES`, the single vocabulary declaration, so
 * {@link convergeMeaning} sees a deterministic sequence.
 */
const ADMISSIBLE_SUBTYPES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Array.from(COMMERCIAL_TYPES, (type) => [
    type,
    DISCOVER_COMMERCIAL_SUBTYPES.filter(
      (subtype) => resolveBuyerCommercialSubtype(type, subtype) === subtype,
    ),
  ]),
);

/**
 * The owner's convergence rule, in one place:
 *
 * > if every valid subtype interpretation converges on the same primary-area semantic, that area
 * > semantic may be used without resolving the subtype.
 *
 * So a legacy `commercial` row whose subtype was never recorded still gets BUILT-UP — both of its
 * admissible readings mean BUILT-UP — without ever being labelled a Shop or an Office. The moment
 * an admissible set disagrees, the answer is UNRESOLVED again, with no code change here.
 */
function convergeMeaning(admissibleSubtypes: readonly string[]): PrimaryAreaMeaning {
  let converged: ResolvedPrimaryAreaMeaning | null = null;
  for (const subtype of admissibleSubtypes) {
    const meaning = MEANING_BY_SUBTYPE[subtype];
    if (meaning === undefined) return 'UNRESOLVED';
    if (converged === null) {
      converged = meaning;
    } else if (converged !== meaning) {
      return 'UNRESOLVED';
    }
  }
  return converged ?? 'UNRESOLVED';
}

/**
 * Resolves the primary-area meaning of ONE property shape. Mirrors
 * `DiscoverPrimaryArea.resolve(String, String)` branch for branch.
 *
 * @param propertyType      stored `property_listings.property_type` (case-insensitive)
 * @param commercialSubtype the buyer subtype when one is explicitly selected, else null/undefined.
 *                          A null here is NOT a defect: it is the normal state of every
 *                          self-describing type. An UNRECOGNISED subtype is not licence to guess —
 *                          it falls through to the type's own admissible set.
 */
export function resolvePrimaryAreaMeaning(
  propertyType: string | null | undefined,
  commercialSubtype?: string | null,
): PrimaryAreaMeaning {
  if (propertyType == null || propertyType.trim() === '') return 'UNRESOLVED';
  const type = propertyType.trim().toLowerCase();

  if (commercialSubtype != null && commercialSubtype.trim() !== '') {
    const bySubtype = MEANING_BY_SUBTYPE[commercialSubtype.trim().toUpperCase()];
    if (bySubtype !== undefined) return bySubtype;
  }

  const admissible = ADMISSIBLE_SUBTYPES[type];
  if (admissible !== undefined) return convergeMeaning(admissible);

  return MEANING_BY_PROPERTY_TYPE[type] ?? 'UNRESOLVED';
}

/** The family a stored property type belongs to, or null when it belongs to none (`other`). */
export function resolvePrimaryAreaFamily(
  propertyType: string | null | undefined,
): PrimaryAreaFamily | null {
  if (propertyType == null || propertyType.trim() === '') return null;
  const type = propertyType.trim().toLowerCase();
  if (COMMERCIAL_TYPES.has(type)) return 'commercial';
  if (type === 'agricultural_land') return 'agricultural';
  if (type in MEANING_BY_PROPERTY_TYPE) return 'residential';
  return null;
}

/**
 * Every selectable property type. Used as the effective selection when the buyer has narrowed
 * nothing — "no type filter" means "all of them", which is the broadest mixture there is.
 */
const ALL_PROPERTY_TYPES: readonly string[] = [
  ...PROPERTY_TYPES.map((t) => t.value),
  'other',
];

// ── The label + disclosure a control should show ──────────────────────────────────────────────

/** What the buyer has narrowed to. Both fields absent/empty means "no narrowing" — everything. */
export interface PrimaryAreaSelection {
  propertyTypes?: readonly string[] | null;
  /** Only meaningful alongside `propertyTypes: ['commercial']`; ignored otherwise. */
  commercialSubtypes?: readonly string[] | null;
}

export interface PrimaryAreaControlLabel {
  /** The control/chip label: a specific quantity when one meaning is in play, else broad. */
  label: string;
  /**
   * The VISIBLE lead for a width-constrained surface (the chip), in sentence case and ready to be
   * followed by a value: "Built-up area", "Commercial built-up/warehouse/plot", "Mixed
   * built-up/warehouse/plot".
   *
   * Distinct for every materially different selection — that is its whole job, and it is why the
   * family scope leads a multi-meaning label. A caller renders this ahead of the range and lets
   * {@link disclosure} trail, so the accessible name still carries the full wording
   * ({@link PRIMARY_AREA_QUANTITY}) even where the sighted buyer sees the short form.
   *
   * A single meaning gets the FULL quantity name, not a short one: it has the whole width to
   * itself, so there is nothing to buy by shortening it.
   */
  shortLabel: string;
  /** The families this selection spans, in canonical order. Empty when nothing resolves. */
  families: PrimaryAreaFamily[];
  /**
   * The D1-mandated sentence naming what is being compared, or null when the label alone already
   * says it (exactly one meaning in play). NEVER null when `meanings.length > 1` — rendering a
   * broad label without this is the failure mode D1 forbids.
   */
  disclosure: string | null;
  /** The resolved meanings this selection spans, in canonical order. */
  meanings: ResolvedPrimaryAreaMeaning[];
  /**
   * True when some selected shape has NO resolvable primary area (`other`, or an unmapped stored
   * type). Such rows stay visible under "Any size" and drop out under any bound — the caller may
   * want to say so, but the bound itself is unaffected.
   */
  hasUnresolved: boolean;
}

function buildDisclosure(
  meaningsByFamily: ReadonlyMap<PrimaryAreaFamily, ReadonlySet<ResolvedPrimaryAreaMeaning>>,
): string {
  const clauses: string[] = [];
  for (const family of FAMILY_ORDER) {
    const inPlay = meaningsByFamily.get(family);
    if (inPlay === undefined) continue;
    for (const term of PRIMARY_AREA_DISCLOSURE_TERMS[family]) {
      if (!inPlay.has(term.meaning)) continue;
      clauses.push(`${PRIMARY_AREA_QUANTITY[term.meaning]} for ${term.subject}`);
    }
  }
  // Semicolons, not commas: several subjects are themselves comma-joined lists
  // ("shops, offices and commercial buildings"), and a comma separator would run them together.
  return `Compares ${clauses.join('; ')}.`;
}

function sentenceCase(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * Builds {@link PrimaryAreaControlLabel.shortLabel}. Three cases, mirroring the three the label
 * itself has, so the two can never disagree about how many meanings are in play.
 */
function buildShortLabel(
  meanings: readonly ResolvedPrimaryAreaMeaning[],
  families: readonly PrimaryAreaFamily[],
): string {
  if (meanings.length === 0) return UNNAMED_AREA_SHORT_LABEL;
  if (meanings.length === 1) return sentenceCase(PRIMARY_AREA_QUANTITY[meanings[0]]);
  const scope =
    families.length === 1 ? PRIMARY_AREA_SCOPE_SHORT[families[0]] : MIXED_SCOPE_SHORT;
  return `${scope} ${meanings.map((m) => PRIMARY_AREA_QUANTITY_SHORT[m]).join('/')}`;
}

/**
 * The label and (when needed) disclosure for the area control, given what the buyer has selected.
 *
 * One meaning in play → that meaning's specific label, no disclosure needed (the label IS the
 * disclosure). More than one → the broad label PLUS a sentence naming each quantity and what it
 * is measured on. That second case is AC6, and it is why this returns a pair rather than a string.
 */
export function resolvePrimaryAreaControlLabel(
  selection: PrimaryAreaSelection = {},
): PrimaryAreaControlLabel {
  const selectedTypes =
    selection.propertyTypes != null && selection.propertyTypes.length > 0
      ? selection.propertyTypes
      : ALL_PROPERTY_TYPES;
  const selectedSubtypes = selection.commercialSubtypes ?? [];

  const meaningsByFamily = new Map<PrimaryAreaFamily, Set<ResolvedPrimaryAreaMeaning>>();
  const meaningsInPlay = new Set<ResolvedPrimaryAreaMeaning>();
  let hasUnresolved = false;

  for (const rawType of selectedTypes) {
    const family = resolvePrimaryAreaFamily(rawType);
    // A narrowed subtype selection only refines the one subtype-bearing type; every other type
    // resolves from itself, exactly as the server does.
    const subtypesToApply =
      rawType.trim().toLowerCase() === SUBTYPE_BEARING_PROPERTY_TYPE && selectedSubtypes.length > 0
        ? selectedSubtypes
        : [null];

    for (const subtype of subtypesToApply) {
      const meaning = resolvePrimaryAreaMeaning(rawType, subtype);
      if (meaning === 'UNRESOLVED' || family === null) {
        hasUnresolved = true;
        continue;
      }
      meaningsInPlay.add(meaning);
      const forFamily = meaningsByFamily.get(family) ?? new Set<ResolvedPrimaryAreaMeaning>();
      forFamily.add(meaning);
      meaningsByFamily.set(family, forFamily);
    }
  }

  const meanings = MEANING_ORDER.filter((m) => meaningsInPlay.has(m));
  const families = FAMILY_ORDER.filter((f) => meaningsByFamily.has(f));
  const shortLabel = buildShortLabel(meanings, families);

  if (meanings.length === 1) {
    return {
      label: PRIMARY_AREA_LABELS[meanings[0]],
      shortLabel,
      families,
      disclosure: null,
      meanings,
      hasUnresolved,
    };
  }
  if (meanings.length === 0) {
    // Nothing selected resolves to a quantity at all (e.g. `other` alone). There is no honest
    // specific label to show, and nothing to disclose a mixture of.
    return {
      label: BROAD_PRIMARY_AREA_LABEL,
      shortLabel,
      families,
      disclosure: null,
      meanings,
      hasUnresolved,
    };
  }
  return {
    label: BROAD_PRIMARY_AREA_LABEL,
    shortLabel,
    families,
    disclosure: buildDisclosure(meaningsByFamily),
    meanings,
    hasUnresolved,
  };
}
