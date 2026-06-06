export const PROPERTY_TYPES = [
  { value: 'land', label: 'Land' },
  { value: 'agricultural_land', label: 'Agricultural Land' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'commercial', label: 'Commercial Shop/Office' },
  { value: 'commercial_building', label: 'Commercial Building' },
  { value: 'warehouse', label: 'Warehouse / Godown' },
  { value: 'commercial_land', label: 'Commercial Land' },
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]['value'];

export const COMMERCIAL_TYPES = new Set<string>([
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
]);

export const FURNISHING_OPTIONS = [
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi_furnished', label: 'Semi Furnished' },
  { value: 'furnished', label: 'Furnished' },
] as const;
