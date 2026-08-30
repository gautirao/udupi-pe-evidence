/**
 * Candidate-derived fixture factory — flows through the REAL production
 * parse path (Issue #2088, commit 7). See
 * `__fixtures__/candidateNavigationTree.ts`'s module doc for the full
 * owner-binding provenance (real vs. DERIVED_TO_COUNT).
 */
import { describe, it, expect } from 'vitest';
import {
  candidateRootNode,
  candidateCentralDirectionNode,
  candidateAvalahalliClusterNode,
  candidateAvalahalliAreaNode,
  resolveCandidateNode,
  CANDIDATE_DRILL_PATH,
  AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS,
} from '../__fixtures__/candidateNavigationTree';
import { nodeLevelKind } from '../nodeLevelKind';

describe('candidateNavigationTree fixture — real production parse path', () => {
  it('root resolves through normalizeNavigationNode to a DIRECTION-level node', () => {
    const root = candidateRootNode();
    expect(root.nodeType).toBe('ROOT');
    expect(nodeLevelKind(root)).toBe('directions');
    expect(root.children.map((c) => c.nodeKey)).toEqual(['d:central', 'd:n', 'd:e']);
  });

  it('d:central resolves to a CLUSTER-level node (the level that does not exist in live revision 8)', () => {
    const central = candidateCentralDirectionNode();
    expect(central.nodeType).toBe('DIRECTION');
    expect(nodeLevelKind(central)).toBe('clusters');
    expect(central.children.length).toBe(3);
    expect(central.children[0].nodeKey).toBe(
      'c:central:in-ka-bengaluru-avalahalli-in-ka-bengaluru-deepanjali-nagar',
    );
  });

  it('the Avalahalli/Deepanjali Nagar cluster resolves to an AREA-level node with the real descendantAreaCount', () => {
    const cluster = candidateAvalahalliClusterNode();
    expect(cluster.nodeType).toBe('CLUSTER');
    expect(nodeLevelKind(cluster)).toBe('areas');
    expect(cluster.children.length).toBe(7); // descendant_area_count, verbatim from candidate-evidence.toml
    expect(cluster.children[0].areaKey).toBe('IN|KA|Bengaluru|Avalahalli');
    expect(cluster.children[1].areaKey).toBe('IN|KA|Bengaluru|Deepanjali Nagar');
  });

  it('the 5 synthesised leaves are unambiguously labelled DERIVED_TO_COUNT, never presented as real', () => {
    const cluster = candidateAvalahalliClusterNode();
    const derived = cluster.children.slice(2);
    expect(derived).toHaveLength(5);
    for (const child of derived) {
      expect(child.areaKey).toMatch(/DERIVED_TO_COUNT/);
      expect(child.displayLabel).toMatch(/synthetic/i);
    }
  });

  it('the real AREA leaf resolves to a LISTINGS-level (terminal) node', () => {
    const area = candidateAvalahalliAreaNode();
    expect(area.nodeType).toBe('AREA');
    expect(area.areaKey).toBe('IN|KA|Bengaluru|Avalahalli');
    expect(nodeLevelKind(area)).toBe('listings');
    expect(area.children).toEqual([]);
  });

  it('resolveCandidateNode returns null for a nodeKey this fixture does not model', () => {
    expect(resolveCandidateNode('d:s')).toBeNull();
    expect(resolveCandidateNode('c:does-not-exist')).toBeNull();
  });

  it('CANDIDATE_DRILL_PATH matches the ac12_api_verified.normal_path in candidate-evidence.toml', () => {
    expect(CANDIDATE_DRILL_PATH).toEqual([
      'root',
      'd:central',
      'c:central:in-ka-bengaluru-avalahalli-in-ka-bengaluru-deepanjali-nagar',
      'a:IN|KA|Bengaluru|Avalahalli',
    ]);
    for (const key of CANDIDATE_DRILL_PATH) {
      expect(resolveCandidateNode(key)).not.toBeNull();
    }
  });

  it('AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS has 7 entries, matching the cluster node children 1:1', () => {
    const cluster = candidateAvalahalliClusterNode();
    expect(AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS).toHaveLength(7);
    expect(AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS).toEqual(cluster.children.map((c) => c.areaKey));
  });
});
