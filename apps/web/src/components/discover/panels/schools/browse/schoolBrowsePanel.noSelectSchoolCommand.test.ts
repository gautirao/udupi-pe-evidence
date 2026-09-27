import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Issue #2661 (review follow-up) — SchoolBrowsePanel's file-header doc
 * comment and the `navigation` field's own inline comment both promise the
 * #1160 invariant: `SchoolBrowsePanelCommands` has no select-school-
 * equivalent action anywhere in its shape, so this panel can never delegate
 * a school selection to a parent.
 *
 * That invariant was previously unchecked — only asserted in prose, with no
 * test of the name the comments themselves cite. It has to be a source-text
 * guard, like `drawEntryPlacement.guard.test.ts`: a *type* has no runtime
 * representation, so a test that only inspects keys on a hand-built
 * `SchoolBrowsePanelCommands` object (the alternative considered here)
 * cannot see a field added to the interface unless that same test also
 * happens to populate it — which defeats the point of a guard against
 * someone else's future edit. Reading the real interface source instead
 * catches the mutation regardless of whether any test constructs a value
 * for it.
 *
 * Comments are stripped before matching (this file's own prose above, and
 * SchoolBrowsePanel.tsx's, both contain the phrase "select-school" and would
 * otherwise self-trigger), and the match requires a field-declaration shape
 * (`identifier` immediately followed by `?:`/`:`), not a bare substring, so
 * prose can never satisfy or defeat this check — only an actual field can.
 */

const PANEL = resolve(__dirname, './SchoolBrowsePanel.tsx');

const rawSource = readFileSync(PANEL, 'utf-8');

const stripped = rawSource
  .replace(/\/\*\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const START_MARKER = 'export interface SchoolBrowsePanelCommands {';
const END_MARKER = 'export interface SchoolBrowsePanelProps {';

const startIndex = stripped.indexOf(START_MARKER);
const endIndex = stripped.indexOf(END_MARKER);

if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
  throw new Error(
    'schoolBrowsePanel.noSelectSchoolCommand.test.ts: could not locate the ' +
      'SchoolBrowsePanelCommands interface body in SchoolBrowsePanel.tsx — ' +
      'has it been renamed or moved?'
  );
}

const commandsInterfaceSource = stripped.slice(startIndex, endIndex);

// Matches a field declaration whose name reads as "select ... school"
// (selectSchool, selectSchoolId, onSelectSchool, ...), immediately followed
// by the `?:`/`:` that makes it an actual interface member — not a
// substring anywhere in surrounding text.
const SELECT_SCHOOL_FIELD_PATTERN = /\b\w*select\w*school\w*\s*\??\s*:/i;

describe('SchoolBrowsePanelCommands — #1160 no-select-school-command guard', () => {
  it('locates the real interface body (sanity check on the extraction itself)', () => {
    // Guards against a silent false-pass if the markers above ever stop
    // bounding the interface (e.g. the file is reordered).
    expect(commandsInterfaceSource).toContain('selectAreaKey');
    expect(commandsInterfaceSource).toContain('navigation');
  });

  it('has no select-school-equivalent field anywhere in SchoolBrowsePanelCommands', () => {
    expect(commandsInterfaceSource).not.toMatch(SELECT_SCHOOL_FIELD_PATTERN);
  });
});
