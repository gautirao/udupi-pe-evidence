/**
 * AC1.9 + AC1.8 + §2.3 zero-content rules — Issue #1956 PR 1 (FE-2).
 *
 * ── The one rule everything here follows ──
 * Journey-aware visibility applies to FINAL AREA PRESENTATION ONLY.
 *
 *   • Areas journey   — a member is included when `eligibleListingCount > 0`.
 *   • Schools journey — a member is included when `eligibleSchoolCount > 0`.
 *   • Zero-content members are excluded from browse clusters AND from `+N`.
 *
 * ── What is NEVER hidden ──
 * STRUCTURAL levels (DIRECTION and CLUSTER / "Local Destination") are never
 * hidden, never removed, never re-parented. They stay visible, in canonical
 * position, with stable parentage and STABLE CANONICAL NAMES, and when their
 * count is zero they render the locked literal `No matches with current filters`.
 *
 * AC1.8 makes the reason explicit: at a structural level the displayed name is a
 * canonical region/destination label, NOT a matching member's name. The `+N`
 * form asserts "there are N more matching areas beyond the ones named here",
 * which is a claim about the NAMES being matches. A stable canonical label
 * carries no such guarantee, so `+N` is never used at a structural level. A test
 * asserts that negatively.
 *
 * ── Zero-content AREA reached directly ──
 * An AREA with no eligible content that a shopper reaches by canonical URL or
 * explicit search stays RESOLVABLE and renders a normal empty state. That is a
 * DISTINCT outcome from "hidden": hiding it would 404 a legitimate deep link.
 *
 * Pure. No React, no I/O, no JSX. Copy is RETURNED as strings, never rendered.
 */
import type { AreaMember, NavigationNodeType } from './types';
import { isStructuralNodeType } from './nodeLevelKind';

/** The two journeys whose eligibility dimension differs. */
export type DiscoverJourney = 'areas' | 'schools';

/**
 * The locked zero-content literal for a structural level. Exported as a constant
 * so the string exists in exactly one place and a test can pin it verbatim.
 */
export const NO_MATCHES_WITH_CURRENT_FILTERS = 'No matches with current filters';

/** The locked noun phrase shared with `nearbyAreaArithmetic.ts`'s zero-hidden form. */
const AREAS_WITH_MATCHES = 'areas with matches';

/**
 * The count a journey measures a member by. The ONLY place the two journeys
 * diverge — everything downstream is journey-agnostic.
 */
export function eligibleCountFor(member: AreaMember, journey: DiscoverJourney): number {
  return journey === 'areas' ? member.eligibleListingCount : member.eligibleSchoolCount;
}

/** A member is eligible for a browse cluster when its journey count is > 0. */
export function isMemberEligible(member: AreaMember, journey: DiscoverJourney): boolean {
  return eligibleCountFor(member, journey) > 0;
}

export interface MemberPartition<T extends AreaMember> {
  /** Members that appear in the browse cluster and count towards `+N`. */
  visible: T[];
  /** Zero-content members: excluded from browse and from `+N`. Still resolvable directly. */
  hidden: T[];
}

/**
 * Splits a browse cluster's members by journey eligibility, PRESERVING input
 * order in both halves. Returns new arrays; the input is never mutated.
 *
 * `hidden` is returned rather than discarded on purpose: "how many did we drop"
 * is diagnostic information, and a caller that needs the direct-entry outcome for
 * one of them ({@link resolveAreaEntry}) still has it in hand.
 */
export function partitionMembersByJourney<T extends AreaMember>(
  members: readonly T[],
  journey: DiscoverJourney,
): MemberPartition<T> {
  const visible: T[] = [];
  const hidden: T[] = [];
  for (const member of members) {
    (isMemberEligible(member, journey) ? visible : hidden).push(member);
  }
  return { visible, hidden };
}

/* ─────────────────────── AC1.8 — structural level presentation ──────────────── */

/**
 * The identity half of a structural level. Every field here is
 * FILTER-INVARIANT — none of them is derived from a count, so no filter change
 * can alter a structural level's identity, parentage, position or name.
 */
export interface StructuralLevelIdentity {
  nodeKey: string;
  nodeType: NavigationNodeType;
  /** Server `displayLabel`. Stable canonical. Never slug-inferred, never count-derived. */
  displayLabel: string;
  parentNodeKey: string | null;
  displayOrder: number;
}

export interface StructuralLevelPresentation extends StructuralLevelIdentity {
  /** Literal `true`: a structural level is never hidden, whatever its count. */
  readonly visible: true;
  /** `N areas with matches`, or the locked zero literal. */
  countLabel: string;
  /** Literal `false`: the `+N` form is never used at a structural level (AC1.8). */
  readonly usesPlusForm: false;
  /** True when the zero literal is showing. */
  isZeroContent: boolean;
}

/**
 * Builds a structural level's presentation from its stable identity plus the
 * SERVER-computed count of matching areas beneath it.
 *
 * `matchingAreaCount` is consumed, never derived: it comes from the navigation
 * counts endpoint's rolled-up total for this node. Nothing here sums children.
 */
export function presentStructuralLevel(
  identity: StructuralLevelIdentity,
  matchingAreaCount: number,
): StructuralLevelPresentation {
  const safeCount = Number.isInteger(matchingAreaCount) && matchingAreaCount > 0
    ? matchingAreaCount
    : 0;
  return {
    ...identity,
    visible: true,
    countLabel:
      safeCount > 0
        ? `${safeCount} ${AREAS_WITH_MATCHES}`
        : NO_MATCHES_WITH_CURRENT_FILTERS,
    usesPlusForm: false,
    isZeroContent: safeCount === 0,
  };
}

/**
 * Guard for the AC1.8 rule, usable by a caller and asserted negatively in tests:
 * a level that is not final AREA presentation may never use the `+N` form.
 */
export function levelMayUsePlusForm(nodeType: NavigationNodeType): boolean {
  return !isStructuralNodeType(nodeType);
}

/* ───────────────────── §2.3 — the zero-content AREA outcome ─────────────────── */

/** How a shopper arrived at an AREA. */
export type AreaEntryPath = 'browse' | 'canonical-url' | 'explicit-search';

/**
 * The three distinct outcomes for an AREA. `'excluded-from-browse'` and
 * `'direct-empty-state'` are deliberately NOT the same value — collapsing them
 * would either 404 a legitimate deep link or leak zero-content areas back into
 * browse.
 */
export type AreaEntryOutcome = 'present' | 'excluded-from-browse' | 'direct-empty-state';

export interface AreaEntryInput {
  member: AreaMember;
  journey: DiscoverJourney;
  entryPath: AreaEntryPath;
}

/**
 * Resolves what happens to an AREA given how it was reached.
 *
 * A zero-content AREA is excluded ONLY from browse. Reached by canonical URL or
 * explicit search it stays resolvable and renders a normal empty state — the
 * shopper asked for that specific area by name, and answering "no such place" to
 * a place that exists is a worse lie than answering "nothing here right now".
 */
export function resolveAreaEntry(input: AreaEntryInput): AreaEntryOutcome {
  const { member, journey, entryPath } = input;
  if (isMemberEligible(member, journey)) {
    return 'present';
  }
  return entryPath === 'browse' ? 'excluded-from-browse' : 'direct-empty-state';
}
