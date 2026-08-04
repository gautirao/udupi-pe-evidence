/**
 * Shared types for the frozen-mock capture harness (issue #2076, Amendment-1, AC12).
 *
 * This harness captures the DESIGN_STATE_MANIFEST.json states enumerated as having a real
 * frozen reference in docs/audit/issue-2076/state-mapping.md (the AC11 deliverable). It does
 * NOT invent new states and does NOT capture anything classified NO_FROZEN_REFERENCE /
 * NOT_DESIGNED there.
 */

import type { Page } from '@playwright/test';

export type CaptureViewport = 'desktop' | 'mobile';

/**
 * The mock exposes `data-design-screen` on a descendant of #root, but
 * docs/audit/issue-2076/state-mapping.md proved mechanically (by reading the `screenId` IIFE in
 * NewDiscover.jsx) that this attribute does NOT change for every designed composition:
 *   - the `-mobile` manifest ids are never emitted at any viewport (screenId has zero reference
 *     to isMobile)
 *   - `areas-listings-query-active` / `areas-listings-filters-active` are never emitted either
 *     (screenId does not branch on listingQuery/filters) — submitting a query or toggling a
 *     filter chip leaves `data-design-screen` at the parent `areas-area-listings` value
 *   - overlays (`shell-city-switcher-open`, `shell-area-autocomplete-open`) are "overlay only;
 *     underlying state unchanged" per the manifest's own notes, so the attribute correctly stays
 *     at whatever screen it was opened from
 *
 * `assertEquality: true` is used only where state-mapping.md verified the attribute genuinely
 * equals the cited manifest id live. Every other capture uses `assertEquality: false` (the
 * attribute value is still read and recorded in the capture's metadata for a reader to see, but
 * it is NOT compared against the manifest id — asserting an equality already proven false would
 * be exactly the "assert something known to be unassertable" trap this harness must avoid) plus
 * at least one other verification method that DOES positively confirm the intended state
 * rendered.
 */
export interface DataDesignScreenVerification {
  kind: 'data-design-screen-attribute';
  /** The value `data-design-screen` is expected to hold if the mechanism actually self-identifies here. */
  expectedScreenId: string;
  /** false for every state-mapping.md "no-self-ID" case — see docstring above. */
  assertEquality: boolean;
}

/** Locates `getByRole('heading', { level: 2 }).first()` and checks its text against the manifest's `expectedHeading`. */
export interface HeadingTextVerification {
  kind: 'heading-text';
  expectedText: string | RegExp;
}

/**
 * Positive content-based verification for compositions `data-design-screen` cannot distinguish
 * (query-active, filters-active, empty-results, the rent variant). Locates matching visible text
 * anywhere on the page unless `scopeSelector` narrows the search.
 */
export interface DomTextVerification {
  kind: 'dom-text';
  description: string;
  expectedText: string | RegExp;
  scopeSelector?: string;
}

/** Reads `<input>.inputValue()` at `selector` and compares it against `expectedValue`. */
export interface InputValueVerification {
  kind: 'input-value';
  description: string;
  selector: string;
  expectedValue: string;
}

/** Reads the `aria-pressed` attribute at `selector` and compares it against `expectedPressed`. */
export interface AriaPressedVerification {
  kind: 'aria-pressed';
  description: string;
  selector: string;
  expectedPressed: boolean;
}

/** Asserts an element matching `selector` is visible — used for overlay compositions (city switcher, autocomplete, school-shortcut). */
export interface ComponentVisibleVerification {
  kind: 'component-visible';
  description: string;
  selector: string;
}

export type Verification =
  | DataDesignScreenVerification
  | HeadingTextVerification
  | DomTextVerification
  | InputValueVerification
  | AriaPressedVerification
  | ComponentVisibleVerification;

export interface VerificationResult {
  kind: Verification['kind'];
  description: string;
  expected: string;
  observed: string;
  /** For assertEquality:false data-design-screen-attribute checks, this is always true — the value is recorded, not asserted. */
  passed: boolean;
  /** true only for the intentionally-non-asserting data-design-screen-attribute record. */
  recordOnly: boolean;
}

export interface CaptureState {
  /** Unique id for this capture — usually the manifest state id, with a suffix when one manifest state serves multiple captures (e.g. the rent variant). */
  id: string;
  /** The DESIGN_STATE_MANIFEST.json state id this capture targets, per state-mapping.md. */
  manifestStateId: string;
  /** #2076 A-state ids (state-mapping.md AC11 numbering) this capture serves as evidence for. */
  aStates: string[];
  viewport: CaptureViewport;
  /** URL hash used to enter the state, appended to /ui_kits/new_discover/index.html. */
  hash: string;
  /** Optional post-navigation interaction needed to reach the composition (typing a query, toggling a chip, opening an overlay). */
  interact?: (page: Page) => Promise<void>;
  verifications: Verification[];
  /** Human explanation of why this state is/isn't self-identifying, and which A-state(s) it evidences. */
  notes: string;
}

export interface CaptureRecord {
  id: string;
  manifestStateId: string;
  aStates: string[];
  viewport: CaptureViewport;
  hash: string;
  requestedViewport: { width: number; height: number };
  observedViewport: { width: number; height: number };
  verifications: VerificationResult[];
  screenshotPath: string;
  notes: string;
  capturedAt: string;
}
