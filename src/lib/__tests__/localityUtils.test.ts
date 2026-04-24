import { describe, it, expect } from 'vitest';
import { filterByCity } from '../localityUtils';

describe('filterByCity', () => {
  const items = [
    { areaKey: 'district:Udupi', name: 'Udupi' },
    { areaKey: 'district:Mangalore', name: 'Mangalore' },
    { areaKey: 'district:Bengaluru', name: 'Bengaluru' },
    { areaKey: 'locality:Manipal', name: 'Manipal' },
    { areaKey: null, name: 'Unknown' },
  ];

  it('matches items whose district resolves to the city', () => {
    const result = filterByCity(items, 'udupi');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Udupi');
  });

  it('matches mangalore', () => {
    const result = filterByCity(items, 'mangalore');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Mangalore');
  });

  it('matches bangalore via Bengaluru district key', () => {
    const result = filterByCity(items, 'bangalore');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bengaluru');
  });

  it('excludes locality-level areaKeys (city not derivable client-side)', () => {
    const result = filterByCity(items, 'udupi');
    expect(result.every((i) => !i.areaKey?.startsWith('locality:'))).toBe(true);
  });

  it('excludes null areaKey items', () => {
    const result = filterByCity(items, 'udupi');
    expect(result.every((i) => i.areaKey !== null)).toBe(true);
  });

  it('returns empty array for unknown citySlug', () => {
    expect(filterByCity(items, 'unknown')).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(filterByCity([], 'udupi')).toEqual([]);
  });

  it('preserves all original item fields', () => {
    const result = filterByCity(items, 'udupi');
    expect(result[0]).toEqual({ areaKey: 'district:Udupi', name: 'Udupi' });
  });
});
