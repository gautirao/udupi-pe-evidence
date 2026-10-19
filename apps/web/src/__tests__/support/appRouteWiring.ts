/**
 * #2835 (#2750 PR-6 batch A) — tolerant source-text matcher for "THIS route in App.tsx is wired and guarded".
 *
 * A parametrised copy of the pilot's `lqWiring` logic (App.brokerListingQualityRoute.test.tsx, left untouched).
 * Pure functions over a source string, no I/O, so the accept/reject self-tests can feed it synthetic sources.
 *
 * Implemented tolerance (a behaviour-preserving rewrite must NOT fail):
 *  - attribute order, extra props between/after, `path = '..'` spacing, multi-line `<Route>` tags;
 *  - quote style of the path value (`".."`, `'..'`, `{".."}`, `{'..'}`, `` {`..`} ``);
 *  - path-value spelling: `normalisePath` lower-cases and strips leading/trailing slashes, so a re-cased
 *    (`/Broker/Dashboard`) or slash-variant declaration of the route is recognised as THE route for the
 *    guard check (`guardedRoute`) and for duplicate detection (`variantPathValues`). `exactPathCount` is
 *    case-insensitive only (no slash tolerance);
 *  - comments (line, block and JSX-expression comments) are stripped before scanning.
 * Rejection (a real regression MUST fail): renamed path or changed `:param`, a second declaration that is the
 * same route up to case/slash (shows as a 2nd `variantPathValues` entry), missing <ProtectedRoute> wrapper,
 * guard around the wrong component, wrong or missing lazy-import target.
 * NOT implemented: a RELATIVE nested alias route (a child `path="x"` under a parent `<Route>`) is not resolved
 * against its parent, so it is neither matched as this route nor detected as a duplicate; only a top-level
 * relative spelling that normalises to the same string is seen. Non-literal `path={expr}` values are ignored.
 */

export interface RouteSpec {
  /** Full route path exactly as declared in App.tsx (may contain `:params`). */
  path: string;
  /** Identifier rendered inside the guard, e.g. `BrokerDashboard`. */
  component: string;
  /** Module path the identifier must be lazily imported from, e.g. `./pages/broker/BrokerDashboard`. */
  importPath: string;
}

export function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** `path` `\s*=\s*` value, whatever the quoting. Not anchored to attribute position. */
const PATH_ATTR_RE =
  /(?<![\w-])path\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\}|\{\s*`([^`]*)`\s*\})/gi;

export function pathValuesIn(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(PATH_ATTR_RE)) out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

/**
 * The opening tag of every `<Route ...>`: from `<Route` to the first `>` at JSX-brace depth 0, so the nested
 * `element={<ProtectedRoute>...</ProtectedRoute>}` (whose own `>` sit inside braces) stays inside its tag.
 */
export function routeOpeningTags(src: string): string[] {
  const tags: string[] = [];
  for (const m of src.matchAll(/<Route(?=[\s/>])/g)) {
    let depth = 0;
    let i = m.index ?? 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(src.slice(m.index ?? 0, i + 1));
  }
  return tags;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-, leading-slash- and trailing-slash-insensitive identity of a path value. */
export function normalisePath(p: string): string {
  return p.toLowerCase().replace(/^\/+|\/+$/g, '');
}

export interface RouteWiring {
  /** Number of `path=` values equal to the route path (case-insensitive). */
  exactPathCount: number;
  /** Every `path=` value that is the same route up to case / leading / trailing slash (duplicate detector). */
  variantPathValues: string[];
  /** Every <Route> whose path is the route renders <ProtectedRoute><Component /></ProtectedRoute> as its element. */
  guardedRoute: boolean;
  /** `const Component = lazy(() => import('<importPath>'))`, any quote style. */
  lazyImport: boolean;
}

export function routeWiring(rawSrc: string, spec: RouteSpec): RouteWiring {
  const src = stripComments(rawSrc);
  const wanted = spec.path.toLowerCase();
  const wantedNorm = normalisePath(spec.path);
  const all = pathValuesIn(src);

  const guardedElementRe = new RegExp(
    `(?<![\\w-])element\\s*=\\s*\\{\\s*<ProtectedRoute>\\s*<${escapeRe(spec.component)}\\s*/>\\s*</ProtectedRoute>\\s*\\}`,
  );
  const tags = routeOpeningTags(src).filter((t) => pathValuesIn(t).some((v) => normalisePath(v) === wantedNorm));

  const lazyRe = new RegExp(
    `const\\s+${escapeRe(spec.component)}\\s*=\\s*lazy\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*(["'\`])${escapeRe(spec.importPath)}\\1\\s*\\)\\s*\\)`,
  );

  return {
    exactPathCount: all.filter((v) => v.toLowerCase() === wanted).length,
    variantPathValues: all.filter((v) => normalisePath(v) === wantedNorm),
    guardedRoute: tags.length > 0 && tags.every((t) => guardedElementRe.test(t)),
    lazyImport: lazyRe.test(src),
  };
}

/** The five #2835 routes, exactly as declared in App.tsx. */
export const BATCH_A_ROUTES: readonly RouteSpec[] = [
  { path: '/broker/dashboard', component: 'BrokerDashboard', importPath: './pages/broker/BrokerDashboard' },
  { path: '/broker/listings', component: 'BrokerListings', importPath: './pages/broker/BrokerListings' },
  { path: '/broker/preferences', component: 'BrokerPreferences', importPath: './pages/broker/Preferences' },
  { path: '/broker/demand-gaps', component: 'BrokerDemandGaps', importPath: './pages/broker/BrokerDemandGaps' },
  {
    path: '/broker/areas/:citySlug/:areaKey',
    component: 'BrokerAreaInsights',
    importPath: './pages/broker/BrokerAreaInsights',
  },
];
