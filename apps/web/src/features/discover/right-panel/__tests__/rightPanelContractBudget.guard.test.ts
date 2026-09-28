/**
 * Issue #2657 — contract-budget guard for the right panel's `{view, commands}`
 * contracts (mechanism copied from #2660's areasJourneyContractBudget.guard).
 * The binding directive: success is not "replace 148 props with one mega
 * `view`" — the LARGEST NESTED GROUP must stay narrow too. This pins, from
 * `contracts.ts`'s own source, EVERY `export interface` it declares and a
 * ceiling on each one's field count, so a future edit cannot quietly regrow
 * a flat bag one level down. Unlike #2660's guard (which hardcodes the group
 * name list), this one discovers every interface directly from the source —
 * a new group added to contracts.ts is automatically covered, never silently
 * skipped.
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

/** Every `export interface <Name> {` declared in contracts.ts, in source order. */
function allInterfaceNames(): string[] {
  return [...SOURCE.matchAll(/^export interface (\w+) \{/gm)].map((m) => m[1]);
}

const GROUP_CEILING = 6;

describe('Right panel contract budget (Issue #2657)', () => {
  it('the public contract is exactly six named view groups and five named command groups', () => {
    expect(interfaceMembers('RightPanelView')).toEqual(['frame', 'shared', 'entry', 'area', 'school', 'agri']);
    expect(interfaceMembers('RightPanelCommands')).toEqual(['shared', 'entry', 'area', 'school', 'agri']);
  });

  const names = allInterfaceNames();

  it('discovers every group interface contracts.ts declares (sanity — this guard covers ALL of them, not a sample)', () => {
    // Regressed if contracts.ts stops declaring interfaces entirely, or if
    // the discovery regex itself silently stops matching (e.g. after a
    // formatting change to `export interface Name {`).
    expect(names.length).toBeGreaterThanOrEqual(30);
    expect(names).toContain('RightPanelView');
    expect(names).toContain('AgriJourneyView');
  });

  it.each(names)(`%s stays within the per-group ceiling (${GROUP_CEILING})`, (name) => {
    const members = interfaceMembers(name);
    expect(members.length).toBeGreaterThan(0);
    expect(members.length).toBeLessThanOrEqual(GROUP_CEILING);
  });
});
