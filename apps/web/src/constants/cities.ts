export const CITIES = [
  { value: 'bangalore', label: 'Bangalore' },
  { value: 'mangalore', label: 'Mangalore' },
  { value: 'udupi', label: 'Udupi' },
];

// Radix Select rejects empty-string values; use this sentinel for "no area selected".
// Translate back to empty string (omit from URL) before navigation.
export const ANY_AREA_SENTINEL = '__any_area__';
