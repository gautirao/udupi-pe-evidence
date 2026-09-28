/**
 * Issue #2660 (Commit 1) — pure extraction, naming the decision
 * `DiscoverAreasJourneyPanel`'s existing if/else early-return chain already
 * makes. This function does NOT change the component's rendered JSX or
 * branch order at all — it is purely a name for the SAME precedence the
 * inline chain already implemented, so the render function can `switch` on
 * an explicit, testable value instead of re-deriving the precedence via
 * nested conditionals.
 *
 * Precedence (unchanged from the pre-extraction inline chain):
 *   loading -> error -> no-node -> cluster-focus -> node-listings ->
 *   area-leaf -> empty-level -> level
 */
export type AreasJourneyBranch =
  | 'loading'
  | 'error'
  | 'no-node'
  | 'cluster-focus'
  | 'node-listings'
  | 'area-leaf'
  | 'empty-level'
  | 'level';

export interface SelectAreasJourneyBranchInput {
  isLoading: boolean;
  isError: boolean;
  hasNode: boolean;
  hasFocusedCluster: boolean;
  isNodeListingsActive: boolean | undefined;
  nodeIsEligibleForBrowse: boolean;
  hasSelectedAreaPoint: boolean;
  childrenLength: number;
}

export function selectAreasJourneyBranch(input: SelectAreasJourneyBranchInput): AreasJourneyBranch {
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  if (!input.hasNode) return 'no-node';
  if (input.hasFocusedCluster) return 'cluster-focus';
  if (input.isNodeListingsActive && input.hasNode && input.nodeIsEligibleForBrowse) return 'node-listings';
  if (input.hasSelectedAreaPoint) return 'area-leaf';
  if (input.childrenLength === 0) return 'empty-level';
  return 'level';
}
