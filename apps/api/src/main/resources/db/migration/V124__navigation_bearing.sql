-- V124: navigation_nodes/sandbox_navigation_nodes bearing_degrees column (#2086 design.R4).
--
-- ADDITIVE ONLY. Adds a nullable bearing_degrees column to BOTH the production navigation_nodes
-- table and its sandbox_navigation_nodes staging mirror — no default, no backfill, no ALTER of any
-- existing NOT NULL column. Existing rows (generated before #2086) simply carry a NULL
-- bearing_degrees until their revision is next regenerated.
--
-- bearing_degrees is the initial great-circle bearing, in degrees normalised to [0, 360), from the
-- PARENT node's centre to THIS node's centre — never relative to a user's camera/viewport (see
-- NavigationTreeGenerator's bearing computation and GeneratedNode's javadoc). NULL for depth-0
-- DIRECTION nodes: no parent NODE exists for a Direction (the city centre is not itself a node).
--
-- Also corrects the now-stale COMMENT ON COLUMN city_region_policy.max_safety_depth left behind by
-- V121: #2033 already changed max_safety_depth's meaning from a public-depth ceiling to an internal
-- bisection-level budget, and #2086 removes it from the partition() decision path entirely (the
-- MANDATORY_MAX_CHILDREN=15 product invariant + proportional k-aware split now govern bucket count;
-- max_safety_depth is still read and folded into the policy_fingerprint for checksum/compat
-- continuity, but no longer participates in any stop/split decision).

ALTER TABLE public.navigation_nodes
    ADD COLUMN IF NOT EXISTS bearing_degrees NUMERIC(6, 3) NULL;

ALTER TABLE public.sandbox_navigation_nodes
    ADD COLUMN IF NOT EXISTS bearing_degrees NUMERIC(6, 3) NULL;

COMMENT ON COLUMN public.navigation_nodes.bearing_degrees IS
    'Great-circle bearing (degrees, [0,360)) from the PARENT node''s centre to this node''s centre '
    '(#2086 design.R4) — never relative to a user camera/viewport. NULL for depth-0 DIRECTION nodes '
    '(no parent node exists).';
COMMENT ON COLUMN public.sandbox_navigation_nodes.bearing_degrees IS
    'Great-circle bearing (degrees, [0,360)) from the PARENT node''s centre to this node''s centre '
    '(#2086 design.R4) — never relative to a user camera/viewport. NULL for depth-0 DIRECTION nodes '
    '(no parent node exists).';

COMMENT ON COLUMN public.city_region_policy.max_safety_depth IS
    'Recursive-cluster generator knob (#1955, meaning changed #2033, removed from the decision path '
    'entirely #2086). Historically bounded internal bisection recursion depth; as of #2086 the '
    'MANDATORY_MAX_CHILDREN=15 product invariant + proportional k-aware partition() govern bucket '
    'count and depth instead. Still READ and folded into the policy_fingerprint (NavigationPolicyFingerprint) '
    'for checksum/compat continuity, but no longer consulted by any stop/split decision in '
    'NavigationTreeGenerator#partition. PLACEHOLDER DEFAULT (see V121 seed UPDATE) — effectively inert.';
