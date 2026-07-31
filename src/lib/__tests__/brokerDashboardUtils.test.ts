/**
 * Unit tests for sortActionCards() — AC6 determinism proof.
 * Pure function, no React, no network.
 */

import { describe, it, expect } from 'vitest';
import {
  sortActionCards,
  buildBrokerGreeting,
  type ActionCardDescriptor,
} from '@/lib/brokerDashboardUtils';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function loc(count: number, isActionable = true): ActionCardDescriptor {
  return { key: 'missingLocation', count, isActionable, priority: 0 };
}

function inc(count: number, isActionable = true): ActionCardDescriptor {
  return { key: 'incomplete', count, isActionable, priority: 1 };
}

function gap(count = 0, isActionable = false): ActionCardDescriptor {
  return { key: 'demandGap', count, isActionable, priority: 2 };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sortActionCards', () => {
  it('AC6-case1: higher-count actionable card sorts before lower-count; non-actionable sinks last', () => {
    // missingLocation count=3 actionable, incomplete count=5 actionable, demandGap non-actionable
    const input = [loc(3), inc(5), gap(0, false)];
    const result = sortActionCards(input);

    expect(result[0].key).toBe('incomplete');   // count=5, highest
    expect(result[1].key).toBe('missingLocation'); // count=3
    expect(result[2].key).toBe('demandGap');    // non-actionable — last
  });

  it('AC6-case2: all counts 0 — non-actionable demandGap sinks last; zero-count actionable cards use priority tiebreak (location before incomplete)', () => {
    // location count=0 actionable, incomplete count=0 actionable, demandGap non-actionable
    const input = [inc(0, true), loc(0, true), gap(0, false)];
    const result = sortActionCards(input);

    // demandGap must be last regardless of iteration order
    expect(result[2].key).toBe('demandGap');

    // Among two zero-count "actionable" cards:
    // isActionable=true but count=0 → aActive = false (isActionable && count > 0 = false)
    // Both sink equally; stable tiebreak by priority → location(0) before incomplete(1)
    expect(result[0].key).toBe('missingLocation');
    expect(result[1].key).toBe('incomplete');
  });

  it('AC6-case3: equal non-zero counts — lower priority index wins (location before incomplete)', () => {
    // location count=2, incomplete count=2 — both actionable
    const input = [inc(2), loc(2)];
    const result = sortActionCards(input);

    expect(result[0].key).toBe('missingLocation'); // priority 0
    expect(result[1].key).toBe('incomplete');       // priority 1
  });

  it('AC6-case4 (idempotence): sorting an already-sorted array yields the same order', () => {
    const sorted = [inc(5), loc(3), gap(0, false)];
    const again = sortActionCards(sorted);

    expect(again.map((c) => c.key)).toEqual(sorted.map((c) => c.key));
  });

  it('does not mutate the input array', () => {
    const input = [loc(3), inc(5), gap(0, false)];
    const inputCopy = [...input];
    sortActionCards(input);
    expect(input).toEqual(inputCopy);
  });

  it('single element returns that element unchanged', () => {
    const single = [loc(7)];
    expect(sortActionCards(single)).toEqual(single);
  });

  it('isActionable=false with non-zero count still sinks to bottom', () => {
    // An actionable=false card with count>0 must still sort after actionable cards
    const input = [gap(99, false), loc(1, true)];
    const result = sortActionCards(input);

    expect(result[0].key).toBe('missingLocation');
    expect(result[1].key).toBe('demandGap');
  });
});

// ── buildBrokerGreeting (issue #2045) ───────────────────────────────────────────

describe('buildBrokerGreeting', () => {
  it('returns full greeting for a simple name', () => {
    expect(buildBrokerGreeting('Asha Rao')).toBe('Welcome back, Asha Rao');
  });

  it('trims surrounding whitespace', () => {
    expect(buildBrokerGreeting('  Asha Rao  ')).toBe('Welcome back, Asha Rao');
  });

  it('preserves the full multi-word name — no first-token split', () => {
    expect(buildBrokerGreeting('John Michael Doe')).toBe('Welcome back, John Michael Doe');
  });

  it('returns fallback for undefined', () => {
    expect(buildBrokerGreeting(undefined)).toBe('Welcome back');
  });

  it('returns fallback for null', () => {
    expect(buildBrokerGreeting(null)).toBe('Welcome back');
  });

  it('returns fallback for empty string', () => {
    expect(buildBrokerGreeting('')).toBe('Welcome back');
  });

  it('returns fallback for whitespace-only string', () => {
    expect(buildBrokerGreeting('   ')).toBe('Welcome back');
  });

  it('returns fallback for a lone non-breaking space (plain trim strips it)', () => {
    expect(buildBrokerGreeting(' ')).toBe('Welcome back');
  });

  it('returns fallback for a number', () => {
    expect(buildBrokerGreeting(123)).toBe('Welcome back');
  });

  it('returns fallback for a plain object', () => {
    expect(buildBrokerGreeting({})).toBe('Welcome back');
  });

  it('returns fallback for an empty array', () => {
    expect(buildBrokerGreeting([])).toBe('Welcome back');
  });

  it('returns fallback for a non-empty array', () => {
    expect(buildBrokerGreeting(['Asha'])).toBe('Welcome back');
  });

  it('returns fallback for a boolean', () => {
    expect(buildBrokerGreeting(true)).toBe('Welcome back');
  });
});
