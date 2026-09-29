/**
 * Installs a width-aware `window.matchMedia` mock so hooks built on
 * `useMediaQuery` (min-width/max-width queries) resolve against one
 * simulated viewport width, instead of the shared test setup's stub which
 * always reports `matches: false` regardless of query. Call it, keep the
 * returned `restore()` and call it in `afterEach`/`afterAll`.
 */
export function mockMatchMediaWidth(width: number) {
  const original = window.matchMedia;

  const matchesQuery = (query: string): boolean => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    if (min) return width >= Number(min[1]);
    const max = /max-width:\s*(\d+)px/.exec(query);
    if (max) return width <= Number(max[1]);
    return false;
  };

  window.matchMedia = ((query: string) => ({
    matches: matchesQuery(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  return {
    restore: () => {
      window.matchMedia = original;
    },
  };
}
