/**
 * DescribeStep — Issue #1838 slice 6b characterisation tests.
 *
 * DescribeStep is a STATELESS presentational component extracted from
 * EditListingForm.tsx's step-1 "Describe" render block (the largest single
 * panel in the EditListingForm decomposition programme — 955 LOC).
 *
 * Per the slice-6b design doc (docs/audit/evidence/issue-1838-editlisting-decomposition/
 * slice-6b-describe-step-design.md §6 / Decision D3): DescribeStep holds no
 * map/canvas/upload/network child (unlike the 6a panels), so real controlled
 * children (AreaField/PriceField/Select/chip groups) are rendered directly —
 * that is what validates true prop routing, which is the entire point of
 * this suite. No heavy-child mocking is required for OOM safety here.
 *
 * The headline risk this suite targets (design doc §5/R2): the two
 * structurally-identical tri-state boolean Select grids and the adjacent
 * same-option chip groups are wired via `[key, label, val, setter]` tuples
 * that are invisible to tsc (all same type) and invisible to the full-form
 * anchors (which don't toggle every boolean). A swapped tuple entry would
 * pass tsc and the anchors silently — only a per-field isolation test like
 * this one catches it.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DescribeStep } from '../DescribeStep';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { useAgriFields } from '../../useAgriFields';
import type { useCommercialFields } from '../../useCommercialFields';
import type { useRentFields } from '../../useRentFields';
import type { useResidentialFields } from '../../useResidentialFields';
import type { useSharedFields } from '../../useSharedFields';

// Stable module-scope shadcn Select stub — SAME pattern already used by the full-form
// anchors (EditListing.residential/agri/commercial/rent.test.tsx: "shadcn Select stub —
// same pattern as EditListing.agri.test.tsx"). Radix Select's popover/portal doesn't open
// via click in jsdom (no real layout/pointer-capture), so the established convention in
// this codebase is a plain-<select> stub. This is a STABLE, module-scope factory (never
// inline/unstable) per the #1837 OOM lesson referenced in the slice-6b design doc §6/D3.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-select-value={value || 'empty'}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <span id={id}>{children}</span>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

/** Find the native <select> stub rendered next to a given field Label text. */
function selectByLabelText(label: string): HTMLElement {
  const labelEl = screen.getByText(label);
  const container = labelEl.closest('div') as HTMLElement;
  return within(container).getByRole('combobox');
}

type DescribeStepProps = React.ComponentProps<typeof DescribeStep>;

// ─── Hook-result stubs — mirror the real hooks' values/setters/hydrate shape,
// each setter a distinct vi.fn() so per-field isolation assertions can tell
// setters apart by reference. ────────────────────────────────────────────────

function makeShared(overrides: Partial<ReturnType<typeof useSharedFields>['values']> = {}): ReturnType<typeof useSharedFields> {
  return {
    values: {
      carpetArea: null, carpetAreaUnit: 'sqft', floorNumber: '', totalFloors: '',
      furnishingStatus: '', facing: '', ownershipType: '',
      ...overrides,
    },
    setters: {
      setCarpetArea: vi.fn(), setCarpetAreaUnit: vi.fn(), setFloorNumber: vi.fn(),
      setTotalFloors: vi.fn(), setFurnishingStatus: vi.fn(), setFacing: vi.fn(),
      setOwnershipType: vi.fn(),
    },
    hydrate: vi.fn(),
  };
}

function makeCommercial(): ReturnType<typeof useCommercialFields> {
  return {
    values: {
      washrooms: '', parkingCount: '', roadFrontageFt: '', commercialUsage: '', numberOfUnits: '',
    },
    setters: {
      setWashrooms: vi.fn(), setParkingCount: vi.fn(), setRoadFrontageFt: vi.fn(),
      setCommercialUsage: vi.fn(), setNumberOfUnits: vi.fn(),
    },
    hydrate: vi.fn(),
  };
}

function makeRent(): ReturnType<typeof useRentFields> {
  return {
    values: { monthlyRent: '', securityDepositMonths: '', lockInMonths: '' },
    setters: { setMonthlyRent: vi.fn(), setSecurityDepositMonths: vi.fn(), setLockInMonths: vi.fn() },
    hydrate: vi.fn(),
  };
}

function makeAgri(overrides: Partial<ReturnType<typeof useAgriFields>['values']> = {}): ReturnType<typeof useAgriFields> {
  return {
    values: {
      waterSource: '', soilType: '', roadAccess: '', cultivationStatus: '',
      surveyNumber: '', landCategory: '', agriConversionStatus: '', farmhouseAvailable: '', fencingDone: '',
      crops: [],
      ...overrides,
    },
    setters: {
      setWaterSource: vi.fn(), setSoilType: vi.fn(), setRoadAccess: vi.fn(),
      setCultivationStatus: vi.fn(), setSurveyNumber: vi.fn(), setLandCategory: vi.fn(),
      setAgriConversionStatus: vi.fn(), setFarmhouseAvailable: vi.fn(), setFencingDone: vi.fn(),
      setCrops: vi.fn(),
    },
    hydrate: vi.fn(),
  };
}

function makeResidential(
  overrides: Partial<ReturnType<typeof useResidentialFields>['values']> = {},
): ReturnType<typeof useResidentialFields> {
  return {
    values: {
      bathrooms: '', balconies: '', parking2wCount: '', parking4wCount: '', roadWidthFt: '',
      maintenancePaise: '', propertyAge: '', residentialWaterSource: '', plotDimensions: '',
      conversionStatus: '', khataNumber: '', propertyTaxPid: '', approvingAuthority: '',
      projectName: '', builderName: '', possessionStatus: '', availabilityTimeline: '',
      priceNegotiable: '', hasLift: '', hasPowerBackup: '', isGated: '', hasGarden: '',
      hasTerrace: '', hasCompound: '', hasServantRoom: '', isCornerPlot: '', hasBoundaryWall: '',
      isGatedLayout: '', hasWaterConnection: '', hasElectricityConnection: '', hasDrainage: '',
      maintenanceIncluded: '', rentNegotiable: '', petsAllowed: '', amenities: [],
      specialLocationViews: [], preferredTenants: [], superBuiltArea: null, superBuiltAreaUnit: 'SQ_FT',
      ...overrides,
    },
    setters: {
      setBathrooms: vi.fn(), setBalconies: vi.fn(), setParking2wCount: vi.fn(), setParking4wCount: vi.fn(),
      setRoadWidthFt: vi.fn(), setMaintenancePaise: vi.fn(), setPropertyAge: vi.fn(),
      setResidentialWaterSource: vi.fn(), setPlotDimensions: vi.fn(), setConversionStatus: vi.fn(),
      setKhataNumber: vi.fn(), setPropertyTaxPid: vi.fn(), setApprovingAuthority: vi.fn(),
      setProjectName: vi.fn(), setBuilderName: vi.fn(), setPossessionStatus: vi.fn(),
      setAvailabilityTimeline: vi.fn(), setPriceNegotiable: vi.fn(), setHasLift: vi.fn(),
      setHasPowerBackup: vi.fn(), setIsGated: vi.fn(), setHasGarden: vi.fn(), setHasTerrace: vi.fn(),
      setHasCompound: vi.fn(), setHasServantRoom: vi.fn(), setIsCornerPlot: vi.fn(),
      setHasBoundaryWall: vi.fn(), setIsGatedLayout: vi.fn(), setHasWaterConnection: vi.fn(),
      setHasElectricityConnection: vi.fn(), setHasDrainage: vi.fn(), setMaintenanceIncluded: vi.fn(),
      setRentNegotiable: vi.fn(), setPetsAllowed: vi.fn(), setAmenities: vi.fn(),
      setSpecialLocationViews: vi.fn(), setPreferredTenants: vi.fn(), setSuperBuiltArea: vi.fn(),
      setSuperBuiltAreaUnit: vi.fn(),
    },
    hydrate: vi.fn(),
  };
}

// Keys visible by default across the assertions in this suite — a curated
// whitelist (not the real CONFIG_MAP; fieldVisible is a PROP here and its
// real implementation lives in the frozen listingFieldConfig.ts / is
// exercised by the full-form anchors, not this suite).
const DEFAULT_VISIBLE: ListingFieldKey[] = [
  'hasLift', 'hasPowerBackup', 'isGated', 'hasGarden', 'hasTerrace', 'hasCompound', 'hasServantRoom',
  'isCornerPlot', 'hasBoundaryWall', 'isGatedLayout', 'hasWaterConnection', 'hasElectricityConnection', 'hasDrainage',
  'maintenanceIncluded', 'bathrooms', 'balconies', 'parking2wCount', 'parking4wCount', 'amenities',
  'landArea', 'builtArea',
];

function makeFieldVisible(visible: ListingFieldKey[] = DEFAULT_VISIBLE) {
  const set = new Set(visible);
  return vi.fn((key: ListingFieldKey) => set.has(key));
}

function baseProps(overrides: Partial<DescribeStepProps> = {}): DescribeStepProps {
  return {
    agri: makeAgri(),
    commercial: makeCommercial(),
    rent: makeRent(),
    residential: makeResidential(),
    shared: makeShared(),
    title: '',
    setTitle: vi.fn(),
    setTitleManuallyEdited: vi.fn(),
    description: '',
    setDescription: vi.fn(),
    priceRupees: null,
    setPriceRupees: vi.fn(),
    propertyType: 'house',
    setPropertyType: vi.fn(),
    locality: '',
    setLocality: vi.fn(),
    landArea: null,
    setLandArea: vi.fn(),
    landAreaUnit: 'cent',
    setLandAreaUnit: vi.fn(),
    bedrooms: '',
    setBedrooms: vi.fn(),
    builtArea: null,
    setBuiltArea: vi.fn(),
    builtAreaUnit: 'sqft',
    setBuiltAreaUnit: vi.fn(),
    reraNumber: '',
    setReraNumber: vi.fn(),
    listingPurpose: 'sale',
    setListingPurpose: vi.fn(),
    fieldVisible: makeFieldVisible(),
    isCommercialType: false,
    handleStep1Save: vi.fn(),
    updateListing: { mutate: vi.fn(), isPending: false } as unknown as DescribeStepProps['updateListing'],
    ...overrides,
  };
}

describe('DescribeStep', () => {
  // ─── 1. Boolean Select grid A — 7 fields ──────────────────────────────────
  describe('boolean Select grid A (hasLift/hasPowerBackup/isGated/hasGarden/hasTerrace/hasCompound/hasServantRoom)', () => {
    const gridA: Array<[key: ListingFieldKey, setterName: keyof ReturnType<typeof useResidentialFields>['setters']]> = [
      ['hasLift', 'setHasLift'],
      ['hasPowerBackup', 'setHasPowerBackup'],
      ['isGated', 'setIsGated'],
      ['hasGarden', 'setHasGarden'],
      ['hasTerrace', 'setHasTerrace'],
      ['hasCompound', 'setHasCompound'],
      ['hasServantRoom', 'setHasServantRoom'],
    ];

    const gridALabels: Record<string, string> = {
      hasLift: 'Lift', hasPowerBackup: 'Power backup', isGated: 'Gated community', hasGarden: 'Garden',
      hasTerrace: 'Terrace', hasCompound: 'Compound wall', hasServantRoom: 'Servant room',
    };

    it.each(gridA)('selecting "%s" fires ONLY its own setter, not the others', async (key, setterName) => {
      const user = userEvent.setup();
      const residential = makeResidential();
      render(<DescribeStep {...baseProps({ residential })} />);

      const select = selectByLabelText(gridALabels[key]);
      await user.selectOptions(select, 'true');

      expect(residential.setters[setterName]).toHaveBeenCalledWith('true');
      for (const [, otherSetterName] of gridA) {
        if (otherSetterName !== setterName) {
          expect(residential.setters[otherSetterName]).not.toHaveBeenCalled();
        }
      }
    });
  });

  // ─── 2. Boolean Select grid B — 6 fields ──────────────────────────────────
  describe('boolean Select grid B (isCornerPlot/hasBoundaryWall/isGatedLayout/hasWaterConnection/hasElectricityConnection/hasDrainage)', () => {
    const gridB: Array<[key: ListingFieldKey, setterName: keyof ReturnType<typeof useResidentialFields>['setters']]> = [
      ['isCornerPlot', 'setIsCornerPlot'],
      ['hasBoundaryWall', 'setHasBoundaryWall'],
      ['isGatedLayout', 'setIsGatedLayout'],
      ['hasWaterConnection', 'setHasWaterConnection'],
      ['hasElectricityConnection', 'setHasElectricityConnection'],
      ['hasDrainage', 'setHasDrainage'],
    ];

    const gridBLabels: Record<string, string> = {
      isCornerPlot: 'Corner plot', hasBoundaryWall: 'Boundary wall', isGatedLayout: 'Gated layout',
      hasWaterConnection: 'Water connection', hasElectricityConnection: 'Electricity connection',
      hasDrainage: 'Drainage',
    };

    it.each(gridB)('selecting "%s" fires ONLY its own setter, not the others', async (key, setterName) => {
      const user = userEvent.setup();
      const residential = makeResidential();
      render(<DescribeStep {...baseProps({ residential })} />);

      const select = selectByLabelText(gridBLabels[key]);
      await user.selectOptions(select, 'false');

      expect(residential.setters[setterName]).toHaveBeenCalledWith('false');
      for (const [, otherSetterName] of gridB) {
        if (otherSetterName !== setterName) {
          expect(residential.setters[otherSetterName]).not.toHaveBeenCalled();
        }
      }
    });
  });

  // ─── 3. maintenanceIncluded value transform ('INCLUDED' <-> 'true') ──────
  describe('maintenanceIncluded value transform', () => {
    it('state "true" renders INCLUDED selected; selecting the other option fires setter("false")', async () => {
      const user = userEvent.setup();
      const residential = makeResidential({ maintenanceIncluded: 'true' });
      render(<DescribeStep {...baseProps({ residential })} />);

      const group = screen.getByTestId('chip-group-maintenanceIncluded');
      expect(within(group).getByRole('radio', { name: 'Included' })).toHaveAttribute('data-state', 'on');
      expect(within(group).getByRole('radio', { name: 'Excluded' })).toHaveAttribute('data-state', 'off');

      await user.click(within(group).getByRole('radio', { name: 'Excluded' }));
      expect(residential.setters.setMaintenanceIncluded).toHaveBeenCalledWith('false');
    });

    it('empty state renders unselected; selecting Included fires setter("true")', async () => {
      const user = userEvent.setup();
      const residential = makeResidential({ maintenanceIncluded: '' });
      render(<DescribeStep {...baseProps({ residential })} />);

      const group = screen.getByTestId('chip-group-maintenanceIncluded');
      expect(within(group).getByRole('radio', { name: 'Included' })).toHaveAttribute('data-state', 'off');
      expect(within(group).getByRole('radio', { name: 'Excluded' })).toHaveAttribute('data-state', 'off');

      await user.click(within(group).getByRole('radio', { name: 'Included' }));
      expect(residential.setters.setMaintenanceIncluded).toHaveBeenCalledWith('true');
    });
  });

  // ─── 4. fieldVisible gating spot-check ────────────────────────────────────
  describe('fieldVisible gating', () => {
    it('hides a field when fieldVisible returns false, shows it when true', () => {
      const { rerender } = render(
        <DescribeStep {...baseProps({ fieldVisible: makeFieldVisible([]) })} />,
      );
      expect(screen.queryByTestId('chip-group-bathrooms')).not.toBeInTheDocument();

      rerender(<DescribeStep {...baseProps({ fieldVisible: makeFieldVisible(['bathrooms']) })} />);
      expect(screen.getByTestId('chip-group-bathrooms')).toBeInTheDocument();
    });
  });

  // ─── 5. Amenities property-type gating ────────────────────────────────────
  describe('amenities property-type gating', () => {
    it('propertyType="apartment" shows APARTMENT amenity options', () => {
      render(<DescribeStep {...baseProps({ propertyType: 'apartment' })} />);
      const group = screen.getByTestId('chip-group-amenities');
      expect(within(group).getByRole('button', { name: 'Gym' })).toBeInTheDocument();
      expect(within(group).queryByRole('button', { name: 'Solar panel' })).not.toBeInTheDocument();
    });

    it('propertyType="house" shows HOUSE_VILLA amenity options', () => {
      render(<DescribeStep {...baseProps({ propertyType: 'house' })} />);
      const group = screen.getByTestId('chip-group-amenities');
      expect(within(group).getByRole('button', { name: 'Solar panel' })).toBeInTheDocument();
      expect(within(group).queryByRole('button', { name: 'Gym' })).not.toBeInTheDocument();
    });

    it('propertyType="villa" shows HOUSE_VILLA amenity options', () => {
      render(<DescribeStep {...baseProps({ propertyType: 'villa' })} />);
      const group = screen.getByTestId('chip-group-amenities');
      expect(within(group).getByRole('button', { name: 'Solar panel' })).toBeInTheDocument();
      expect(within(group).queryByRole('button', { name: 'Gym' })).not.toBeInTheDocument();
    });
  });

  // ─── 6. Adjacent chip groups fire their own setter ────────────────────────
  describe('adjacent same-option chip groups', () => {
    it('bathrooms and balconies each fire their own setter, not the neighbour', async () => {
      const user = userEvent.setup();
      const residential = makeResidential();
      render(<DescribeStep {...baseProps({ residential })} />);

      const bathroomsGroup = screen.getByTestId('chip-group-bathrooms');
      await user.click(within(bathroomsGroup).getByRole('radio', { name: '2' }));
      expect(residential.setters.setBathrooms).toHaveBeenCalledWith('2');
      expect(residential.setters.setBalconies).not.toHaveBeenCalled();

      const balconiesGroup = screen.getByTestId('chip-group-balconies');
      await user.click(within(balconiesGroup).getByRole('radio', { name: '1' }));
      expect(residential.setters.setBalconies).toHaveBeenCalledWith('1');
      expect(residential.setters.setBathrooms).toHaveBeenCalledOnce(); // still only the earlier call
    });

    it('parking2wCount and parking4wCount each fire their own setter, not the neighbour', async () => {
      const user = userEvent.setup();
      const residential = makeResidential();
      render(<DescribeStep {...baseProps({ residential })} />);

      const parking2wGroup = screen.getByTestId('chip-group-parking2wCount');
      await user.click(within(parking2wGroup).getByRole('radio', { name: '1' }));
      expect(residential.setters.setParking2wCount).toHaveBeenCalledWith('1');
      expect(residential.setters.setParking4wCount).not.toHaveBeenCalled();

      const parking4wGroup = screen.getByTestId('chip-group-parking4wCount');
      await user.click(within(parking4wGroup).getByRole('radio', { name: '2' }));
      expect(residential.setters.setParking4wCount).toHaveBeenCalledWith('2');
      expect(residential.setters.setParking2wCount).toHaveBeenCalledOnce();
    });
  });

  // ─── 7. AreaField + PriceField integration ────────────────────────────────
  describe('AreaField + PriceField integration', () => {
    it('interacting with the land AreaField fires setLandArea/setLandAreaUnit with correct signatures', async () => {
      const user = userEvent.setup();
      const setLandArea = vi.fn();
      const setLandAreaUnit = vi.fn();
      render(
        <DescribeStep
          {...baseProps({
            propertyType: 'land',
            setLandArea,
            setLandAreaUnit,
            fieldVisible: makeFieldVisible(['landArea']),
          })}
        />,
      );

      const input = screen.getByPlaceholderText('Enter area');
      await user.type(input, '10');
      // DescribeStep's AreaField onChange wrapper calls setLandArea(area) and
      // setLandAreaUnit(unit) as two SEPARATE single-arg calls (not one combined call) —
      // verifies both setters are wired to their own field, not swapped or merged.
      expect(setLandArea).toHaveBeenCalledWith(10);
      expect(setLandAreaUnit).toHaveBeenCalledWith('cent');
    });

    it('interacting with PriceField fires setPriceRupees with a numeric rupee value', async () => {
      const user = userEvent.setup();
      const setPriceRupees = vi.fn();
      render(<DescribeStep {...baseProps({ setPriceRupees })} />);

      const priceInput = screen.getByPlaceholderText(/e\.g\. 50 lakh/i);
      await user.type(priceInput, '50 lakh');
      expect(setPriceRupees).toHaveBeenCalledWith(5_000_000);
    });

    it('renders without crashing when both AreaField and PriceField are visible together', () => {
      expect(() =>
        render(<DescribeStep {...baseProps({ propertyType: 'apartment' })} />),
      ).not.toThrow();
    });
  });

  // ─── 8. Crop chip control (issue #2044, AC8 edit-flow wiring) ─────────────
  describe('crop chip control (agri-only, issue #2044)', () => {
    it('renders all 12 canonical crop chips when the agri fields section is visible', () => {
      render(
        <DescribeStep
          {...baseProps({
            propertyType: 'agricultural_land',
            fieldVisible: makeFieldVisible([...DEFAULT_VISIBLE, 'waterSource']),
          })}
        />,
      );
      const cropGroup = screen.getByTestId('chip-group-agri-crops');
      expect(within(cropGroup).getByText('Areca / supari')).toBeInTheDocument();
      expect(within(cropGroup).getByText('Fallow / open')).toBeInTheDocument();
      expect(cropGroup.querySelectorAll('button')).toHaveLength(12);
    });

    it('reflects the current agri.values.crops selection', () => {
      render(
        <DescribeStep
          {...baseProps({
            propertyType: 'agricultural_land',
            fieldVisible: makeFieldVisible([...DEFAULT_VISIBLE, 'waterSource']),
            agri: makeAgri({ crops: ['COCONUT', 'PEPPER'] }),
          })}
        />,
      );
      const cropGroup = screen.getByTestId('chip-group-agri-crops');
      expect(within(cropGroup).getByRole('button', { name: 'Coconut' })).toHaveAttribute('data-state', 'on');
      expect(within(cropGroup).getByRole('button', { name: 'Pepper' })).toHaveAttribute('data-state', 'on');
      expect(within(cropGroup).getByRole('button', { name: 'Paddy' })).toHaveAttribute('data-state', 'off');
    });

    it('clicking a crop chip calls agri.setters.setCrops', async () => {
      const user = userEvent.setup();
      const setCrops = vi.fn();
      const agri = makeAgri();
      agri.setters.setCrops = setCrops;
      render(
        <DescribeStep
          {...baseProps({
            propertyType: 'agricultural_land',
            fieldVisible: makeFieldVisible([...DEFAULT_VISIBLE, 'waterSource']),
            agri,
          })}
        />,
      );
      await user.click(within(screen.getByTestId('chip-group-agri-crops')).getByRole('button', { name: 'Mango' }));
      expect(setCrops).toHaveBeenCalledWith(['MANGO']);
    });

    it('is absent entirely when the agri fields section is not visible (non-agri property types)', () => {
      render(<DescribeStep {...baseProps({ propertyType: 'apartment' })} />);
      expect(screen.queryByTestId('chip-group-agri-crops')).not.toBeInTheDocument();
    });
  });
});
