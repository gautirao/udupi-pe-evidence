-- V123: widen navigation_nodes/sandbox_navigation_nodes node_type to allow 'DIRECTION' (#1956 PR1).
--
-- EXPAND-ONLY. A production revision was generated, validated (13/13 pre-#1956 invariants), and
-- promoted with region_key carried ONLY as a column value — NavigationTreeGenerator never emitted
-- a node for the region itself, so with max_safety_depth=0 the generated tree was City -> AREA:
-- every area a root, no DIRECTION ancestor anywhere. The revision was rolled back once this was
-- discovered. This migration + its accompanying generator/validator changes make Direction a
-- GENUINE ancestor node (kind 'DIRECTION', node_key "d:" + slug(region_key)) rather than only
-- row metadata.
--
-- V121's two node_type CHECK constraints only allowed ('CLUSTER', 'AREA'); this migration widens
-- both to also allow 'DIRECTION'. No data rewrite, no column drop, no index drop — every existing
-- row's node_type is untouched (it was already CLUSTER or AREA, both still permitted).
--
-- The sibling CHECK ((node_type = 'AREA') = (area_key IS NOT NULL)) from V121 is UNCHANGED and
-- still satisfied by DIRECTION rows: a DIRECTION node's area_key is NULL, and node_type='AREA' is
-- false for it, so (false = false) holds. No ALTER needed for that constraint.
--
-- Postgres auto-names an inline (unnamed) CHECK constraint "<table>_<column>_check" — the names
-- dropped below are exactly what V121's inline `node_type TEXT NOT NULL CHECK (node_type IN (...))`
-- clauses were assigned.

ALTER TABLE public.navigation_nodes
    DROP CONSTRAINT IF EXISTS navigation_nodes_node_type_check;
ALTER TABLE public.navigation_nodes
    ADD CONSTRAINT navigation_nodes_node_type_check CHECK (node_type IN ('DIRECTION', 'CLUSTER', 'AREA'));

ALTER TABLE public.sandbox_navigation_nodes
    DROP CONSTRAINT IF EXISTS sandbox_navigation_nodes_node_type_check;
ALTER TABLE public.sandbox_navigation_nodes
    ADD CONSTRAINT sandbox_navigation_nodes_node_type_check CHECK (node_type IN ('DIRECTION', 'CLUSTER', 'AREA'));

COMMENT ON COLUMN public.navigation_nodes.node_type IS
    'DIRECTION (region-level root, #1956), CLUSTER, or AREA (leaf). A DIRECTION node is the sole '
    'root of a city''s public navigation tree as of #1956 — every AREA/CLUSTER must descend from '
    'one (enforced by NavigationTreeValidationService check #14, not just this CHECK).';
COMMENT ON COLUMN public.sandbox_navigation_nodes.node_type IS
    'DIRECTION (region-level root, #1956), CLUSTER, or AREA (leaf) — mirrors public.navigation_nodes.node_type.';
