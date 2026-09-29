/** Direct, DOM-free unit coverage for the item-list construction `RoleActionsOverflowMenu` feeds its dropdown (opening it via `userEvent.click` is unreliable in this test environment). */
import { describe, it, expect } from 'vitest';
import { dedupeNavByHref, withTrends, type NavRoleItem } from '../AppLayout';
import { Home, Plus } from 'lucide-react';

function item(name: string, href: string): NavRoleItem {
  return { name, href, icon: Home };
}

describe('dedupeNavByHref', () => {
  it('keeps every item when hrefs are all distinct', () => {
    const items = [item('Broker dashboard', '/broker/dashboard'), item('New listing', '/broker/listings/new')];
    expect(dedupeNavByHref(items)).toEqual(items);
  });

  it('drops a later item whose href duplicates an earlier one, keeping the FIRST label seen', () => {
    const items = [
      item('Broker dashboard', '/broker/dashboard'),
      item('New listing', '/broker/listings/new'),
      item('Notifications', '/notifications'),
      // Same real combination used for the Dealer overflow menu: the
      // detailed nav's "Dashboard" duplicates the role nav's own
      // "Broker dashboard" by href.
      item('Dashboard', '/broker/dashboard'),
      item('My Listings', '/broker/listings'),
    ];
    const result = dedupeNavByHref(items);
    expect(result.map((i) => i.name)).toEqual([
      'Broker dashboard',
      'New listing',
      'Notifications',
      'My Listings',
    ]);
    expect(result.find((i) => i.href === '/broker/dashboard')?.name).toBe('Broker dashboard');
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeNavByHref([])).toEqual([]);
  });

  it('preserves icon references (not just name/href) on the surviving item', () => {
    const surviving = { name: 'Broker dashboard', href: '/broker/dashboard', icon: Plus };
    const dropped = { name: 'Dashboard', href: '/broker/dashboard', icon: Home };
    const result = dedupeNavByHref([surviving, dropped]);
    expect(result).toEqual([surviving]);
    expect(result[0].icon).toBe(Plus);
  });
});

/** "Trends" folds into the Dealer/Admin overflow menu instead of a separate standalone link. */
describe('withTrends', () => {
  const baseItems = [item('Broker dashboard', '/broker/dashboard'), item('New listing', '/broker/listings/new')];

  it('appends a Trends item when discoverTrendsHref is given', () => {
    const result = withTrends(baseItems, '/trends?city=udupi');
    expect(result).toHaveLength(3);
    expect(result[2].name).toBe('Trends');
    expect(result[2].href).toBe('/trends?city=udupi');
    expect(result[2].icon).toBeDefined();
  });

  it('is a no-op (returns the SAME array) when discoverTrendsHref is undefined', () => {
    const result = withTrends(baseItems, undefined);
    expect(result).toBe(baseItems);
  });

  it('composes with dedupeNavByHref (Trends is appended AFTER deduping, never itself deduped away)', () => {
    const items = dedupeNavByHref([
      item('Broker dashboard', '/broker/dashboard'),
      item('Dashboard', '/broker/dashboard'),
    ]);
    const result = withTrends(items, '/trends?city=udupi');
    expect(result.map((i) => i.name)).toEqual(['Broker dashboard', 'Trends']);
  });
});
