/**
 * #2835 (#2750 PR-6 batch A) — self-tests for the tolerant App.tsx route matcher (appRouteWiring.ts).
 * A matcher that only ever sees today's App.tsx proves nothing about its own tolerance or its own teeth, so this
 * file feeds it synthetic sources: ACCEPT = behaviour-preserving rewrites must keep the facts green,
 * REJECT = real regressions must flip the fact that names them.
 */
import { describe, it, expect } from 'vitest';
import { BATCH_A_ROUTES, normalisePath, routeWiring, stripComments, type RouteSpec } from './appRouteWiring';

const lazyOf = (spec: RouteSpec, q = '"') => `const ${spec.component} = lazy(() => import(${q}${spec.importPath}${q}));`;
const guard = (spec: RouteSpec) => `<ProtectedRoute><${spec.component} /></ProtectedRoute>`;
const guardedRoute = (spec: RouteSpec, pathAttr = `path="${spec.path}"`) =>
  `<Route ${pathAttr} element={${guard(spec)}} />`;

describe('appRouteWiring matcher', () => {
  describe.each(BATCH_A_ROUTES)('route $path', (spec) => {
    it('ACCEPT: every quoting style of the path attribute is recognised, and guard + lazy import are seen', () => {
      const styles: Array<[string, string, string]> = [
        ['double-quoted', `path="${spec.path}"`, '"'],
        ['single-quoted', `path='${spec.path}'`, "'"],
        ['JSX expression, double', `path={"${spec.path}"}`, '"'],
        ['JSX expression, single', `path={'${spec.path}'}`, "'"],
        ['template literal', `path={\`${spec.path}\`}`, '`'],
      ];
      for (const [label, attr, q] of styles) {
        expect(routeWiring(`${lazyOf(spec, q)}\n${guardedRoute(spec, attr)}`, spec), label).toEqual({
          exactPathCount: 1,
          variantPathValues: [spec.path],
          guardedRoute: true,
          lazyImport: true,
        });
      }
    });

    it('ACCEPT: behaviour-preserving prop reorder, extra props, `path = ..` spacing, multi-line tags and path case stay green', () => {
      const G = guard(spec);
      const tolerated: Array<[string, string]> = [
        ['element before path', `<Route element={${G}} path="${spec.path}" />`],
        ['extra prop between', `<Route path="${spec.path}" caseSensitive element={${G}} />`],
        ['extra prop after', `<Route path="${spec.path}" element={${G}} caseSensitive />`],
        ['spaced path = and element =', `<Route path = '${spec.path}' element = {${G}} />`],
        [
          'multi-line, element first',
          `<Route\n  element={\n    <ProtectedRoute>\n      <${spec.component} />\n    </ProtectedRoute>\n  }\n  path="${spec.path}"\n/>`,
        ],
        ['upper-cased path value', `<Route path="${spec.path.toUpperCase()}" element={${G}} />`],
      ];
      for (const [label, route] of tolerated) {
        const w = routeWiring(route, spec);
        expect(w.exactPathCount, label).toBe(1);
        expect(w.guardedRoute, label).toBe(true);
        expect(w.variantPathValues, label).toHaveLength(1);
      }
      for (const [label, route] of tolerated.slice(0, 5)) {
        expect(routeWiring(route, spec).variantPathValues, label).toEqual([spec.path]);
      }
      // an unrelated route with extra props earlier in the file must neither mask nor fake this route
      const w = routeWiring(
        `<Route path="/other" element={<Other />} />\n<Route element={${G}} caseSensitive path="${spec.path}" />`,
        spec,
      );
      expect(w).toMatchObject({ exactPathCount: 1, guardedRoute: true });
    });

    it('ACCEPT (recasing): a re-cased or slash-variant ONLY declaration is recognised as THE guarded route', () => {
      const capitalised = spec.path.replace(/\/(\w)/g, (_m, c: string) => `/${c.toUpperCase()}`);
      expect(capitalised).not.toBe(spec.path);
      const variants: Array<[string, string, number]> = [
        ['capitalised segments', capitalised, 1],
        ['upper-cased', spec.path.toUpperCase(), 1],
        ['trailing slash', `${spec.path}/`, 0],
      ];
      for (const [label, declared, exact] of variants) {
        expect(routeWiring(`${lazyOf(spec)}\n${guardedRoute(spec, `path="${declared}"`)}`, spec), label).toEqual({
          exactPathCount: exact,
          variantPathValues: [declared],
          guardedRoute: true,
          lazyImport: true,
        });
        expect(normalisePath(declared), label).toBe(normalisePath(spec.path));
      }
    });

    it('REJECT (recasing control): a re-cased declaration that is UNGUARDED, or a re-cased second declaration, is not accepted', () => {
      const capitalised = spec.path.replace(/\/(\w)/g, (_m, c: string) => `/${c.toUpperCase()}`);
      // re-cased but unguarded: still seen as the route (1 variant), and the guard fact flips
      const unguarded = routeWiring(`<Route path="${capitalised}" element={<${spec.component} />} />`, spec);
      expect(unguarded.variantPathValues).toEqual([capitalised]);
      expect(unguarded.guardedRoute).toBe(false);
      // guarded original + guarded re-cased duplicate: the single-declaration fact (length 1) breaks
      const dup = routeWiring(`${guardedRoute(spec)}\n${guardedRoute(spec, `path="${capitalised}"`)}`, spec);
      expect(dup.variantPathValues).toEqual([spec.path, capitalised]);
      // guarded re-cased + UNGUARDED original: a guarded sibling must not vouch for the unguarded one
      const mixed = routeWiring(
        `${guardedRoute(spec, `path="${capitalised}"`)}\n<Route path="${spec.path}" element={<${spec.component} />} />`,
        spec,
      );
      expect(mixed.guardedRoute).toBe(false);
      expect(mixed.variantPathValues).toHaveLength(2);
    });

    it('ACCEPT: a commented-out duplicate declaration (line, block and JSX comment) does not count', () => {
      const src = [
        lazyOf(spec),
        guardedRoute(spec),
        `// <Route path="${spec.path}" element={<${spec.component} />} />`,
        `/* <Route path="${spec.path}" element={<${spec.component} />} /> */`,
        `{/* <Route path="${spec.path}" element={<${spec.component} />} /> */}`,
      ].join('\n');
      expect(stripComments(src)).not.toContain('//');
      expect(routeWiring(src, spec)).toMatchObject({ exactPathCount: 1, guardedRoute: true, lazyImport: true });
    });

    it('REJECT: a guard-less route is seen as unguarded even with reordered or extra props', () => {
      const unguarded = [
        `<Route path="${spec.path}" element={<${spec.component} />} />`,
        `<Route element={<${spec.component} />} path="${spec.path}" />`,
        `<Route caseSensitive element={<${spec.component} />} path = '${spec.path}' />`,
        // guard wraps the wrong component
        `<Route path="${spec.path}" caseSensitive element={<ProtectedRoute><Other /></ProtectedRoute>} />`,
      ];
      for (const route of unguarded) {
        expect(routeWiring(route, spec), route).toMatchObject({ exactPathCount: 1, guardedRoute: false });
      }
      // a guarded sibling elsewhere must not vouch for an unguarded route
      expect(
        routeWiring(
          `<Route path="/x" element={${guard(spec)}} />\n<Route element={<${spec.component} />} path="${spec.path}" />`,
          spec,
        ).guardedRoute,
      ).toBe(false);
    });

    it('REJECT: a renamed path removes every exact-path fact', () => {
      for (const renamed of [`${spec.path}-v2`, spec.path.replace('/broker/', '/brokers/')]) {
        const w = routeWiring(`${lazyOf(spec)}\n${guardedRoute(spec, `path="${renamed}"`)}`, spec);
        expect(w.exactPathCount, renamed).toBe(0);
        expect(w.guardedRoute, renamed).toBe(false);
        expect(w.variantPathValues, renamed).toEqual([]);
      }
    });

    it('REJECT: trailing-slash, relative and re-cased duplicates show up as a second path value', () => {
      const base = guardedRoute(spec);
      const relative = spec.path.replace(/^\//, '');
      expect(routeWiring(`${base}\n${guardedRoute(spec, `path="${spec.path}/"`)}`, spec).variantPathValues).toHaveLength(2);
      expect(routeWiring(`${base}\n${guardedRoute(spec, `path="${relative}"`)}`, spec).variantPathValues).toHaveLength(2);
      const recased = routeWiring(`${base}\n${guardedRoute(spec, `path='${spec.path.toUpperCase()}'`)}`, spec);
      expect(recased.variantPathValues).toHaveLength(2);
      expect(recased.exactPathCount).toBe(2);
    });

    it('REJECT: a wrong lazy-import target or a missing lazy import is not accepted', () => {
      expect(routeWiring(`const ${spec.component} = lazy(() => import('./pages/broker/Other'));`, spec).lazyImport).toBe(false);
      expect(routeWiring(`import ${spec.component} from '${spec.importPath}';`, spec).lazyImport).toBe(false);
      expect(routeWiring(lazyOf(spec), spec).lazyImport).toBe(true);
    });
  });

  it('REJECT (param route): changing a `:param` name is a different route', () => {
    const spec = BATCH_A_ROUTES.find((r) => r.path.includes(':areaKey'));
    expect(spec).toBeDefined();
    const w = routeWiring(guardedRoute(spec!, 'path="/broker/areas/:citySlug/:areaId"'), spec!);
    expect(w.exactPathCount).toBe(0);
    expect(w.guardedRoute).toBe(false);
  });

  it('the five routes under test are distinct (no spec can be satisfied by another route)', () => {
    const paths = BATCH_A_ROUTES.map((r) => r.path.toLowerCase());
    expect(new Set(paths).size).toBe(5);
    expect(new Set(BATCH_A_ROUTES.map((r) => r.component)).size).toBe(5);
  });
});
