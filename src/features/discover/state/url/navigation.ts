/**
 * Navigation URL domain — Issue #1956 PR 1 (FE-1).
 *
 * Owns the two params that carry the canonical Areas hierarchy preview:
 *   • `node`         — the Areas hierarchy identity cursor (AC1.4)
 *   • `areasPreview` — the deployment-preview opt-in flag (AC1.3)
 *
 * NEW 8th capability domain, wired into the useDiscoverUrlState facade
 * alongside viewport/city/filters/school/area/agricultural/compatibility. See
 * useDiscoverUrlState.ts's module doc for the full param contract.
 *
 * READ-ONLY IN PR 1 — deliberately. This domain exposes NO actions:
 *   • Nothing writes `node` yet, because there is no canonical Areas panel to
 *     navigate (that arrives in PR 2). PR 1 only needs to be able to PARSE a
 *     `node=` that already exists in the URL.
 *   • Nothing writes `areasPreview`, ever, by design — see AC1.3 below.
 * Every legacy Areas param (groupId/areaKey/scope/region/group/groupResults)
 * keeps working exactly as it does today; this module is purely additive.
 *
 * AC1.4 — `node=` is the SOLE Areas hierarchy identity inside preview. No
 * Areas path may read or write `groupId` / `region` / `areaKey` / `scope` as
 * hierarchy identity: `region` is agricultural-only, `scope` serves the
 * residential axis, `groupId` is school-first level 2, and `areaKey` is
 * school-first hybrid plus the three area-guide producers (AreaCtaBlock /
 * AreaGuide / AreaGuideHero). None of them is hierarchy identity, and this
 * module reads none of them.
 *
 * THE FRONTEND NEVER CONSTRUCTS NODE KEYS. The formula happens to be
 * `"a:" + areaKey`, and hardcoding that client-side is the exact antipattern
 * that produced the `macroRegionResolver` problem. Node keys originate ONLY
 * from the server, via
 * `GET /api/discover/cities/{city}/areas/{areaKey}/navigation-path`. There is
 * therefore no key-construction helper here, and PR 1 must not add one.
 *
 * AC1.3 — `areasPreview=1` survives preview navigation and refresh for free:
 * every existing writer in this facade mutates a copy of the CURRENT params
 * (`new URLSearchParams(prev)`), so an unknown-to-them param is carried
 * through untouched. It is NEVER written by an ordinary interaction and NEVER
 * appears in a canonical/share URL because no writer for it exists anywhere in
 * the app — the strongest available form of "the serializer never emits it",
 * and the same modelling `schoolPicking` uses for its own read side. A static
 * sweep in this domain's test file pins that absence so a future URLSearchParams
 * set/append of the param cannot appear unnoticed. (`startOver` rebuilds a
 * fresh param set from scratch and so drops it — correct: Start Over is a
 * deliberate full reset, not preview navigation.)
 *
 * Salvage note: an older, much larger draft of this module exists in the
 * issue-1956-pr-b worktree carrying write actions, an href builder, a byte cap
 * and a key-shape allowlist. Those belong to the PRs that actually navigate
 * and render (PR 2+); importing them here would ship unreachable, untestable
 * write paths in a PR whose shopper outcome is NONE. Only the read discipline
 * was salvaged.
 */
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

type NavigationState = Pick<DiscoverUrlState, 'node' | 'areasPreview'>;

/**
 * Reads the raw `node` param, normalising absent / empty / whitespace-only to
 * null.
 *
 * The `?.trim()` discipline is the SAME one the existing panel-state branches
 * already apply to `groupId` (`groupId?.trim()` in both the school-group-areas
 * and area-group-results guards). A whitespace-only value is truthy as a
 * string, so without the trim a stray `?node=%20%20` would read as the literal
 * `'   '` and any later `if (node)` check would treat it as a real hierarchy
 * identity.
 */
function readNodeParam(urlParams: URLSearchParams): string | null {
  const trimmed = urlParams.get('node')?.trim();
  return trimmed ? trimmed : null;
}

export function useNavigationUrlDomain(
  ctx: UrlDomainCtx,
): UrlDomainModule<NavigationState, Record<string, never>> {
  const { urlParams } = ctx;

  const node = readNodeParam(urlParams);

  // Presence-flag read style, identical to schoolPicking (school.ts) and
  // groupResults (area.ts): exactly `=1` enables, anything else is undefined.
  const areasPreview = urlParams.get('areasPreview') === '1' ? true : undefined;

  return { state: { node, areasPreview }, actions: {} };
}
