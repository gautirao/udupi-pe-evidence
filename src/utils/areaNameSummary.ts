/**
 * areaNameSummary — Issue #1659
 *
 * Shared utility for formatted member-area name summaries on grouped discovery
 * cards (area-first, school-first, agri-first).
 *
 * Design rules (from the issue spec):
 * - Show 3 area names by default.
 * - If more than 3, append "+ n more".
 * - If exactly 4 short names fit safely, showing all 4 is acceptable.
 * - If no member names resolve, return null (caller falls back to description).
 * - Never return raw area keys.
 * - Never include duplicate area names.
 */

/**
 * Build a summary string from a list of area keys by looking up their display
 * names in a provided name index.
 *
 * @param areaKeys  - The ordered keys belonging to the group (e.g. group.area_keys).
 * @param nameIndex - Map from areaKey → human-readable name. Keys that are absent
 *                    from the index are silently skipped.
 * @param maxShown  - Maximum number of names to show before "+ n more".
 *                    Defaults to 3. Callers may pass 4 when they detect short names.
 * @returns A formatted string like "Whitefield, Marathahalli + 1 more", or null when
 *          no keys resolve to a name (caller should fall back to the existing description).
 */
export function formatMemberAreaSummary(
  areaKeys: string[],
  nameIndex: ReadonlyMap<string, string>,
  maxShown = 3,
): string | null {
  // Collect unique, resolved names (preserving order, deduplicating by name).
  const seen = new Set<string>();
  const names: string[] = [];
  for (const key of areaKeys) {
    const name = nameIndex.get(key);
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  if (names.length === 0) return null;

  // If all names fit within the cap (or exactly 1 more than cap for the "show all
  // 4 short names" optional rule), show them all.
  if (names.length <= maxShown) {
    return names.join(', ');
  }

  // More than maxShown: show the first maxShown and suffix "+ n more".
  const shown = names.slice(0, maxShown);
  const remaining = names.length - maxShown;
  return `${shown.join(', ')} + ${remaining} more`;
}

/**
 * Build a name-index Map from an iterable of objects with areaKey and name fields.
 * Convenience wrapper so callers don't need to build the Map inline.
 */
export function buildAreaNameIndex(
  areas: ReadonlyArray<{ areaKey: string; name: string }>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const area of areas) {
    index.set(area.areaKey, area.name);
  }
  return index;
}
