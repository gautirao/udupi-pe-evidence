import type { ChipOption } from '@/components/broker/ChipGroup';

/**
 * #2387 — page-health decomposition: chip-option constants used by
 * ResidentialPropertyDetailsSection and ResidentialMoreDetailsSection.
 * Verbatim extraction from ResidentialListingForm.tsx — no behaviour change.
 * Kept separate from ResidentialFormPrimitives.tsx (component-only exports)
 * so react-refresh/only-export-components stays clean.
 */

export const BHK_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '1', label: '1 BHK' },
  { value: '2', label: '2 BHK' },
  { value: '3', label: '3 BHK' },
  { value: '4', label: '4 BHK' },
  { value: '5', label: '5+ BHK' },
];

export const BATHROOM_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4+' },
];

export const BALCONY_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3+' },
];

export const PARKING_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3+' },
];

export const FLOORS_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: 'Ground' },
  { value: '1', label: 'G+1' },
  { value: '2', label: 'G+2' },
  { value: '3', label: 'G+3' },
  { value: '4', label: 'G+4+' },
];
