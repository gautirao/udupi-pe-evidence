/**
 * Issue #2660 (Commit 1) — pure extraction, verbatim logic, out of
 * `DiscoverAreasJourneyPanel.tsx`'s inline `nodeIsEligibleForBrowse` IIFE.
 *
 * Issue #2087: Bounded eligibility guard at the panel level.
 * If nodeListings=1 is set in the URL but the resolved node is ineligible
 * (root node or >15 canonical descendant areas), the caller clears the URL
 * flag instead of rendering NodeListingsSurface. This prevents URL/deep-link
 * bypass of the <=15 constraint — the server also enforces this, but the UI
 * should degrade gracefully rather than showing an error.
 */
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

export function isNodeEligibleForBrowse(node: NavigationNodeResponse | null): boolean {
  if (!node) return false;
  if (node.nodeKey === ROOT_NODE_KEY) return false;
  const count = node.descendantAreaKeys?.length ?? 0;
  return count > 0 && count <= 15;
}
