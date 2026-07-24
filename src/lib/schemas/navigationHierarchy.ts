import { z } from 'zod';

/**
 * Issue #1955 (Areas PR A) — runtime validation for the admin city-launch
 * revision navigation hierarchy contract:
 *   GET  /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/navigation/tree
 *   GET  /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/navigation/diff?against=...
 *   GET  /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/navigation/overrides
 *   POST /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/navigation/overrides
 *
 * These are NEW admin-only response shapes (not covered by any existing
 * schema), so per the task guardrails they get Zod validation here rather
 * than being trusted as `unknown`/`any`. Existing promoted-Discover response
 * shapes (regions/areas/markers/listings) are intentionally left untouched —
 * only the NEW hierarchy endpoints this PR introduces are validated.
 *
 * Shapes below are aligned to the SHIPPED backend DTOs (code-review cycle 1
 * fix, #1955): NavigationPreviewTreeResponse, NavigationTreeDiffResponse,
 * AdminNavigationOverrideResponse (backend/.../discover/citylaunch/). Do not
 * "round up" these shapes without re-reading the backend DTO — it is the
 * persisted, tested source of truth.
 */

export const navigationNodeTypeSchema = z.enum(['CLUSTER', 'AREA']);
export type NavigationNodeType = z.infer<typeof navigationNodeTypeSchema>;

// ---------------------------------------------------------------------------
// Tree — GET .../navigation/tree returns a FLAT node list, not a nested
// {cityId, root}. NavigationPreviewTreeResponse.PreviewNode carries a
// per-node `bounds` (NavigationBoundsResponse) but no per-node
// `validationStatus` (that's a revision-level field) — this mirrors
// AdminCityLaunchPreviewController's split of structural preview data from
// listing/display-time concerns.
// ---------------------------------------------------------------------------

/**
 * NavigationBoundsResponse — a per-node bounding box, added to every node
 * (CLUSTER and AREA) in NavigationPreviewTreeResponse.PreviewNode. All six
 * fields are non-null numbers on every node per the shipped backend DTO.
 */
export const navigationBoundsSchema = z.object({
  centreLat: z.number(),
  centreLon: z.number(),
  minLat: z.number(),
  minLon: z.number(),
  maxLat: z.number(),
  maxLon: z.number(),
});
export type NavigationBounds = z.infer<typeof navigationBoundsSchema>;

export const previewNodeSchema = z.object({
  nodeKey: z.string(),
  nodeType: navigationNodeTypeSchema,
  parentNodeKey: z.string().nullable(),
  regionKey: z.string().nullable(),
  areaKey: z.string().nullable(),
  displayLabel: z.string(),
  depth: z.number().int().nonnegative(),
  ancestorKeys: z.array(z.string()),
  representativeAreaKeys: z.array(z.string()),
  displayOrder: z.number().int(),
  descendantAreaCount: z.number().int().nonnegative(),
  bounds: navigationBoundsSchema,
});
export type PreviewNode = z.infer<typeof previewNodeSchema>;

export const navigationTreeResponseSchema = z.object({
  revisionId: z.number(),
  validationStatus: z.string(),
  validationErrors: z.array(z.string()),
  nodes: z.array(previewNodeSchema),
});
export type NavigationTreeResponse = z.infer<typeof navigationTreeResponseSchema>;

/**
 * A `PreviewNode` plus its client-built `children` — the server sends a flat
 * list keyed by `parentNodeKey`, never a nested tree. `buildNavigationForest`
 * in navigationTreeUtils.ts is the single place this shape gets constructed;
 * every other consumer (NavigationHierarchyTree, the guided journey) reads
 * this shape rather than re-deriving parent/child linkage itself.
 */
export interface NavigationTreeNode extends PreviewNode {
  children: NavigationTreeNode[];
}

// ---------------------------------------------------------------------------
// Diff (structural-only, no counts) — AC14 item 4. `added`/`removed` are
// node-key strings (NavigationTreeDiffResponse), not node-summary objects —
// the backend diff only reports which keys changed, not their label/depth.
// `overridesFingerprint` is nullable: a zero-override revision's diff (the
// default BASE comparison, or after deleting the last remaining override)
// has no fingerprint to report.
// ---------------------------------------------------------------------------

export const navigationDiffAgainstSchema = z.enum(['BASE', 'PREVIOUS_REVISION']);
export type NavigationDiffAgainst = z.infer<typeof navigationDiffAgainstSchema>;

export const navigationDiffMovedEntrySchema = z.object({
  nodeKey: z.string(),
  fromParentNodeKey: z.string().nullable(),
  toParentNodeKey: z.string().nullable(),
});
export type NavigationDiffMovedEntry = z.infer<typeof navigationDiffMovedEntrySchema>;

export const navigationDiffRelabeledEntrySchema = z.object({
  nodeKey: z.string(),
  fromLabel: z.string(),
  toLabel: z.string(),
});
export type NavigationDiffRelabeledEntry = z.infer<typeof navigationDiffRelabeledEntrySchema>;

export const navigationDiffRepresentativeChangeEntrySchema = z.object({
  nodeKey: z.string(),
  fromRepresentativeAreaKeys: z.array(z.string()),
  toRepresentativeAreaKeys: z.array(z.string()),
});
export type NavigationDiffRepresentativeChangeEntry = z.infer<
  typeof navigationDiffRepresentativeChangeEntrySchema
>;

export const navigationDiffResponseSchema = z.object({
  revisionId: z.number(),
  against: navigationDiffAgainstSchema,
  overridesFingerprint: z.string().nullable(),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  moved: z.array(navigationDiffMovedEntrySchema),
  relabeled: z.array(navigationDiffRelabeledEntrySchema),
  representativeChanges: z.array(navigationDiffRepresentativeChangeEntrySchema),
});
export type NavigationDiffResponse = z.infer<typeof navigationDiffResponseSchema>;

// ---------------------------------------------------------------------------
// Overrides — AC14 item 6. Discriminated union on `kind`, one variant per
// backend-documented override kind. Modelled as a discriminated union (not a
// flat DTO with optional fields) so a caller can never construct, say, an
// EXCLUDE_AREA payload that also carries `newLabel` — invalid combinations
// are unrepresentable rather than merely unvalidated.
// ---------------------------------------------------------------------------

const overrideReasonField = z.string().optional();

export const excludeAreaOverrideInputSchema = z.object({
  kind: z.literal('EXCLUDE_AREA'),
  subjectAreaKey: z.string(),
  reason: overrideReasonField,
});
export type ExcludeAreaOverrideInput = z.infer<typeof excludeAreaOverrideInputSchema>;

export const reassignAreaRegionOverrideInputSchema = z.object({
  kind: z.literal('REASSIGN_AREA_REGION'),
  subjectAreaKey: z.string(),
  targetRegionKey: z.string(),
  reason: overrideReasonField,
});
export type ReassignAreaRegionOverrideInput = z.infer<typeof reassignAreaRegionOverrideInputSchema>;

export const moveAreaOverrideInputSchema = z.object({
  kind: z.literal('MOVE_AREA'),
  subjectAreaKey: z.string(),
  targetNodeKey: z.string(),
  reason: overrideReasonField,
});
export type MoveAreaOverrideInput = z.infer<typeof moveAreaOverrideInputSchema>;

export const relabelOverrideInputSchema = z.object({
  kind: z.literal('RELABEL'),
  subjectNodeKey: z.string(),
  newLabel: z.string().min(1),
  reason: overrideReasonField,
});
export type RelabelOverrideInput = z.infer<typeof relabelOverrideInputSchema>;

export const setRepresentativesOverrideInputSchema = z.object({
  kind: z.literal('SET_REPRESENTATIVES'),
  subjectNodeKey: z.string(),
  newRepresentativeAreaKeys: z.array(z.string()).min(1),
  reason: overrideReasonField,
});
export type SetRepresentativesOverrideInput = z.infer<typeof setRepresentativesOverrideInputSchema>;

export const navigationOverrideInputSchema = z.discriminatedUnion('kind', [
  excludeAreaOverrideInputSchema,
  reassignAreaRegionOverrideInputSchema,
  moveAreaOverrideInputSchema,
  relabelOverrideInputSchema,
  setRepresentativesOverrideInputSchema,
]);
export type NavigationOverrideInput = z.infer<typeof navigationOverrideInputSchema>;
export type NavigationOverrideKind = NavigationOverrideInput['kind'];

/**
 * GET .../navigation/overrides — one applied override
 * (AdminNavigationOverrideResponse). Uses the backend's `id` (not
 * `overrideId`) and carries no `appliedAt` — the backend DTO doesn't emit
 * one. `reason` is nullable (not just optional): Jackson serializes the
 * DB's nullable `reason` column as an explicit JSON `null` when no reason
 * was given, not an omitted key. Each variant is defined directly against
 * the response shape (not `.extend()`-ed from the input schema) since the
 * response always carries `applyOrder`/`id` and the backend may include
 * other kinds' now-irrelevant fields as `null` alongside it — Zod's default
 * "strip unknown keys" behaviour drops those harmlessly.
 */
const overrideRecordReasonField = z.string().nullable().optional();

export const excludeAreaOverrideRecordSchema = z.object({
  kind: z.literal('EXCLUDE_AREA'),
  id: z.number(),
  applyOrder: z.number().int(),
  subjectAreaKey: z.string(),
  reason: overrideRecordReasonField,
});
export type ExcludeAreaOverrideRecord = z.infer<typeof excludeAreaOverrideRecordSchema>;

export const reassignAreaRegionOverrideRecordSchema = z.object({
  kind: z.literal('REASSIGN_AREA_REGION'),
  id: z.number(),
  applyOrder: z.number().int(),
  subjectAreaKey: z.string(),
  targetRegionKey: z.string(),
  reason: overrideRecordReasonField,
});
export type ReassignAreaRegionOverrideRecord = z.infer<typeof reassignAreaRegionOverrideRecordSchema>;

export const moveAreaOverrideRecordSchema = z.object({
  kind: z.literal('MOVE_AREA'),
  id: z.number(),
  applyOrder: z.number().int(),
  subjectAreaKey: z.string(),
  targetNodeKey: z.string(),
  reason: overrideRecordReasonField,
});
export type MoveAreaOverrideRecord = z.infer<typeof moveAreaOverrideRecordSchema>;

export const relabelOverrideRecordSchema = z.object({
  kind: z.literal('RELABEL'),
  id: z.number(),
  applyOrder: z.number().int(),
  subjectNodeKey: z.string(),
  newLabel: z.string(),
  reason: overrideRecordReasonField,
});
export type RelabelOverrideRecord = z.infer<typeof relabelOverrideRecordSchema>;

export const setRepresentativesOverrideRecordSchema = z.object({
  kind: z.literal('SET_REPRESENTATIVES'),
  id: z.number(),
  applyOrder: z.number().int(),
  subjectNodeKey: z.string(),
  newRepresentativeAreaKeys: z.array(z.string()),
  reason: overrideRecordReasonField,
});
export type SetRepresentativesOverrideRecord = z.infer<typeof setRepresentativesOverrideRecordSchema>;

export const navigationOverrideRecordSchema = z.discriminatedUnion('kind', [
  excludeAreaOverrideRecordSchema,
  reassignAreaRegionOverrideRecordSchema,
  moveAreaOverrideRecordSchema,
  relabelOverrideRecordSchema,
  setRepresentativesOverrideRecordSchema,
]);
export type NavigationOverrideRecord = z.infer<typeof navigationOverrideRecordSchema>;

/** GET .../navigation/overrides returns a BARE JSON array, not {revisionId, overrides:[...]}. */
export const navigationOverridesResponseSchema = z.array(navigationOverrideRecordSchema);
export type NavigationOverridesResponse = z.infer<typeof navigationOverridesResponseSchema>;

/**
 * 422 ValidationReport body. The task spec names this body but does not fix
 * its exact shape, so this is deliberately lenient (`.passthrough()`, all
 * fields optional beyond `message`) — it renders whatever issue messages the
 * backend sends without asserting an unconfirmed exact contract. Callers
 * MUST fall back to the raw ApiError message when this fails to parse.
 */
export const validationReportIssueSchema = z
  .object({
    code: z.string().optional(),
    message: z.string(),
    nodeKey: z.string().optional(),
  })
  .passthrough();

export const validationReportSchema = z
  .object({
    issues: z.array(validationReportIssueSchema).optional(),
    errors: z.array(validationReportIssueSchema).optional(),
  })
  .passthrough();
export type ValidationReport = z.infer<typeof validationReportSchema>;
