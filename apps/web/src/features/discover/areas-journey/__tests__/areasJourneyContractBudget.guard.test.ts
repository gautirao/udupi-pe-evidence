/**
 * Issue #2660 — contract-budget guard for the Areas journey's
 * `{view, commands}` contracts. The issue's binding directive: success is not
 * "replace 48 props with one mega `view`" — the LARGEST NESTED GROUP must stay
 * narrow too. This pins, from `contracts.ts`'s own source, the group names of
 * the public panel and leaf contracts and a ceiling on every group's field
 * count, so a future edit cannot quietly regrow a flat bag one level down.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../contracts.ts'), 'utf-8');

/** Top-level member names of `interface <name> { ... }` (2-space indentation, as written in contracts.ts). */
function interfaceMembers(name: string): string[] {
  const match = SOURCE.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`interface ${name} not found in contracts.ts`);
  return [...match[1].matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1]);
}

/** Quoted keys of the `Pick<..., 'a' | 'b'>` behind `export type <name> =`. */
function pickKeys(name: string): string[] {
  const match = SOURCE.match(new RegExp(`export type ${name} = Pick<([\\s\\S]*?)>;`));
  if (!match) throw new Error(`type ${name} not found in contracts.ts`);
  return [...match[1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);
}

const GROUP_CEILING = 6;

describe('Areas journey contract budget (Issue #2660)', () => {
  it('the public panel contract is exactly five named view groups and five named command groups', () => {
    expect(interfaceMembers('DiscoverAreasJourneyPanelView')).toEqual(['hierarchy', 'cluster', 'results', 'schools', 'city']);
    expect(interfaceMembers('DiscoverAreasJourneyPanelCommands')).toEqual([
      'hierarchy',
      'cluster',
      'results',
      'schools',
      'navigation',
    ]);
  });

  it('the AREA-leaf contract is three view groups and four command groups', () => {
    expect(interfaceMembers('AreaLeafListingsSurfaceView')).toEqual(['leaf', 'results', 'schools']);
    expect(interfaceMembers('AreaLeafListingsSurfaceCommands')).toEqual(['hierarchy', 'navigation', 'results', 'schools']);
  });

  it.each([
    'AreasJourneyHierarchyView',
    'AreasJourneyHierarchyCommands',
    'AreasJourneyClusterView',
    'AreasJourneyClusterCommands',
    'AreasJourneyResultsView',
    'AreasJourneyResultsCommands',
    'AreasJourneySchoolView',
    'AreasJourneySchoolCommands',
    'AreasJourneyNavigationCommands',
  ])(`%s stays within the per-group ceiling (${GROUP_CEILING})`, (name) => {
    const members = interfaceMembers(name);
    expect(members.length).toBeGreaterThan(0);
    expect(members.length).toBeLessThanOrEqual(GROUP_CEILING);
  });

  it('the hierarchy read-state is a narrow Pick of the journey hook result (8 read fields, no actions)', () => {
    const keys = pickKeys('AreasJourneyHierarchyState');
    expect(keys).toHaveLength(8);
    // Actions arrive as commands.hierarchy, never inside the read-state.
    expect(keys).not.toContain('selectNode');
    expect(keys).not.toContain('refetch');
  });
});
