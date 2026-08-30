/**
 * Pure utility functions for the Broker Dashboard v2.
 * Extracted here so qa can unit-test them without importing a React component.
 */

/**
 * Represents a single "Start here today" action card descriptor for ordering.
 */
export interface ActionCardDescriptor {
  /** Unique key matching the actionSignals field name or 'demandGap' */
  key: 'missingLocation' | 'incomplete' | 'demandGap';
  count: number;
  /** True when this signal has a real actionable count (not UNAVAILABLE/LIMITED_DATA) */
  isActionable: boolean;
  /**
   * Stable tiebreak priority: lower number = higher priority.
   * location = 0, incomplete = 1, demandGap = 2
   */
  priority: 0 | 1 | 2;
}

/**
 * Pure deterministic sort for "Start here today" action cards (AC6).
 *
 * Rules (descending precedence):
 *   1. Non-actionable cards (count === 0 OR isActionable === false) sort LAST.
 *   2. Among actionable cards: descending affected-listing count.
 *   3. Stable tiebreak: priority field (location=0 beats incomplete=1 beats demandGap=2).
 *
 * Same input always produces same output order.
 */
export function sortActionCards(cards: ActionCardDescriptor[]): ActionCardDescriptor[] {
  return [...cards].sort((a, b) => {
    const aActive = a.isActionable && a.count > 0;
    const bActive = b.isActionable && b.count > 0;
    if (aActive !== bActive) {
      // non-active sinks to bottom
      return aActive ? -1 : 1;
    }
    if (a.count !== b.count) {
      return b.count - a.count; // descending count
    }
    return a.priority - b.priority; // stable tiebreak
  });
}

/**
 * Builds the broker dashboard greeting from a (possibly absent/invalid) display name.
 *
 * Returns the COMPLETE greeting string — never a bare name fragment — so callers
 * can render it directly with no additional literal text or punctuation.
 */
export function buildBrokerGreeting(displayName?: unknown): string {
  if (typeof displayName !== 'string') {
    return 'Welcome back';
  }
  const trimmed = displayName.trim();
  if (trimmed === '') {
    return 'Welcome back';
  }
  return `Welcome back, ${trimmed}`;
}
