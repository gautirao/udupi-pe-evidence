/**
 * DescribeStep — Issue #1838 PR A characterisation test: DOM-order oracle.
 *
 * DescribeStep.tsx (1,611 LOC) is the largest single panel slated for
 * decomposition in PRs B–E. This suite locks in the RENDER ORDER of every
 * `data-testid`-bearing element for a representative set of
 * propertyType × listingPurpose fixtures, so a later refactor that
 * accidentally reorders sections (e.g. moving "Utilities" above
 * "Amenities", or hoisting a commercial-only block above the shared
 * fields) fails loudly here even though every individual field-level test
 * in DescribeStep.test.tsx would still pass (those assert PRESENCE/wiring
 * per field in isolation, never relative ORDER across fields).
 *
 * This is a golden-master oracle: the expected arrays below were captured
 * from the CURRENT (pre-decomposition) render output, not hand-designed —
 * see the local-mutation-check note in the PR A handback report for how
 * this was verified to actually fail on a reorder.
 *
 * Reuses the same shadcn Select stub and hook-result-stub factories as
 * DescribeStep.test.tsx (duplicated here rather than imported — test-file
 * setup is local-per-file by convention in this repo; these are trimmed to
 * only what baseProps needs).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DescribeStep } from '../DescribeStep';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { useAgriFields } from '../../useAgriFields';
import type { useCommercialFields } from '../../useCommercialFields';
import type { useRentFields } from '../../useRentFields';
import type { useResidentialFields } from '../../useResidentialFields';
import type { useSharedFields } from '../../useSharedFields';

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

type DescribeStepProps = React.ComponentProps<typeof DescribeStep>;

// ─── Issue #1838 PR E — flat test-fixture shape (see DescribeStep.test.tsx
// for the rationale; duplicated per this repo's local-per-file test
// convention) ────────────────────────────────────────────────────────────
type PropertyTypeValue = DescribeStepProps['view']['basics']['propertyType'];

interface DescribeStepFlatProps {
  agri: ReturnType<typeof useAgriFields>;
  commercial: ReturnType<typeof useCommercialFields>;
  rent: ReturnType<typeof useRentFields>;
  residential: ReturnType<typeof useResidentialFields>;
  shared: ReturnType<typeof useSharedFields>;
  title: string;
  setTitle: (v: string) => void;
  markTitleManuallyEdited: () => void;
  description: string;
  setDescription: (v: string) => void;
  priceRupees: number | null;
  setPriceRupees: (v: number | null) => void;
  propertyType: PropertyTypeValue;
  changePropertyType: (value: PropertyTypeValue) => void;
  commercialSubtype: DescribeStepProps['view']['capabilities']['commercialSubtype'];
  locality: string;
  setLocality: (v: string) => void;
  landArea: number | null;
  setLandArea: (value: number | null, unit: string) => void;
  landAreaUnit: string;
  bedrooms: string;
  setBedrooms: (v: string) => void;
  builtArea: number | null;
  setBuiltArea: (value: number | null, unit: string) => void;
  builtAreaUnit: string;
  reraNumber: string;
  setReraNumber: (v: string) => void;
  listingPurpose: DescribeStepProps['view']['basics']['listingPurpose'];
  setListingPurpose: (v: DescribeStepProps['view']['basics']['listingPurpose']) => void;
  fieldVisible: (key: ListingFieldKey) => boolean;
  isCommercialType: boolean;
  handleStep1Save: (e: React.FormEvent) => void;
  isSaving: boolean;
}

function makeShared(): ReturnType<typeof useSharedFields> {
  return {
    values: {
      carpetArea: null, carpetAreaUnit: 'sqft', floorNumber: '', totalFloors: '',
      furnishingStatus: '', facing: '', ownershipType: '',
    },
    setters: {
      setCarpetArea: vi.fn(), setCarpetAreaUnit: vi.fn(), setFloorNumber: vi.fn(),
      setTotalFloors: vi.fn(), setFurnishingStatus: vi.fn(), setFacing: vi.fn(),
      setOwnershipType: vi.fn(),
    },
    hydrate: vi.fn(),
  };
}

function makeCommercial(
  overrides: Partial<ReturnType<typeof useCommercialFields>['values']> = {},
): ReturnType<typeof useCommercialFields> {
  return {
    values: {
      washrooms: '', parkingCount: '', roadFrontageFt: '', commercialUsage: '', numberOfUnits: '',
      explicitSubtype: '', commercialAreaUnit: '', floorChoice: '', hubType: '',
      floorMode: '', powerLoadKva: '', occupancyStatus: '', officeSeats: '',
      officeCabins: '', officeMeetingRooms: '', warehouseClearHeightFt: '',
      warehouseLoadingBays: '', warehouseTruckAccess: '', warehouseFlooring: '',
      commercialZoning: '', commercialOwnership: '', commercialApprovals: '',
      washroomsPublic: '', washroomsPrivate: '', parkingPublicCount: '', parkingPrivateCount: '',
      commercialFurnishingStatus: '', utilities: undefined, utilitiesTouched: false,
      suitableUses: undefined, suitableUsesTouched: false, commercialAvailability: '',
      expectedRentalYieldPct: '', currentMonthlyIncomePaise: '', leaseTermMonths: '',
      leaseEscalationPct: '',
      ...overrides,
    },
    setters: {
      setWashrooms: vi.fn(), setParkingCount: vi.fn(), setRoadFrontageFt: vi.fn(),
      setCommercialUsage: vi.fn(), setNumberOfUnits: vi.fn(),
      setExplicitSubtype: vi.fn(), setCommercialAreaUnit: vi.fn(), setFloorChoice: vi.fn(),
      setHubType: vi.fn(), setFloorMode: vi.fn(), setPowerLoadKva: vi.fn(),
      setOccupancyStatus: vi.fn(), setOfficeSeats: vi.fn(), setOfficeCabins: vi.fn(),
      setOfficeMeetingRooms: vi.fn(), setWarehouseClearHeightFt: vi.fn(),
      setWarehouseLoadingBays: vi.fn(), setWarehouseTruckAccess: vi.fn(),
      setWarehouseFlooring: vi.fn(), setCommercialZoning: vi.fn(), setCommercialOwnership: vi.fn(),
      setCommercialApprovals: vi.fn(), setWashroomsPublic: vi.fn(), setWashroomsPrivate: vi.fn(),
      setParkingPublicCount: vi.fn(), setParkingPrivateCount: vi.fn(),
      setCommercialFurnishingStatus: vi.fn(), setUtilities: vi.fn(), setSuitableUses: vi.fn(),
      setCommercialAvailability: vi.fn(), setExpectedRentalYieldPct: vi.fn(),
      setCurrentMonthlyIncomePaise: vi.fn(), setLeaseTermMonths: vi.fn(), setLeaseEscalationPct: vi.fn(),
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

function makeResidential(): ReturnType<typeof useResidentialFields> {
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

const RESIDENTIAL_VISIBLE: ListingFieldKey[] = [
  'hasLift', 'hasPowerBackup', 'isGated', 'hasGarden', 'hasTerrace', 'hasCompound', 'hasServantRoom',
  'isCornerPlot', 'hasBoundaryWall', 'isGatedLayout', 'hasWaterConnection', 'hasElectricityConnection', 'hasDrainage',
  'maintenanceIncluded', 'bathrooms', 'balconies', 'parking2wCount', 'parking4wCount', 'amenities',
  'landArea', 'builtArea',
];

const COMMERCIAL_SHOP_VISIBLE: ListingFieldKey[] = [
  'carpetArea', 'floorNumber', 'furnishingStatus', 'washrooms', 'parkingCount',
  'roadFrontageFt', 'commercialUsage', 'commercialSubtype', 'floorChoice', 'hubType',
  'occupancyStatus', 'washroomsPublic', 'washroomsPrivate', 'parkingPublicCount', 'parkingPrivateCount',
  'commercialFurnishingStatus', 'suitableUses', 'commercialAvailability', 'commercialAreaUnit',
  'utilities', 'builtArea',
];

const AGRI_VISIBLE: ListingFieldKey[] = [...RESIDENTIAL_VISIBLE, 'waterSource'];

function makeFieldVisible(visible: ListingFieldKey[]) {
  const set = new Set(visible);
  return vi.fn((key: ListingFieldKey) => set.has(key));
}

function baseProps(overrides: Partial<DescribeStepFlatProps> = {}): DescribeStepProps {
  const flat: DescribeStepFlatProps = {
    agri: makeAgri(),
    commercial: makeCommercial(),
    rent: makeRent(),
    residential: makeResidential(),
    shared: makeShared(),
    title: '',
    setTitle: vi.fn(),
    markTitleManuallyEdited: vi.fn(),
    description: '',
    setDescription: vi.fn(),
    priceRupees: null,
    setPriceRupees: vi.fn(),
    propertyType: 'house',
    changePropertyType: vi.fn(),
    commercialSubtype: undefined,
    locality: '',
    setLocality: vi.fn(),
    landArea: null,
    setLandArea: vi.fn(),
    landAreaUnit: 'cent',
    bedrooms: '',
    setBedrooms: vi.fn(),
    builtArea: null,
    setBuiltArea: vi.fn(),
    builtAreaUnit: 'sqft',
    reraNumber: '',
    setReraNumber: vi.fn(),
    listingPurpose: 'sale',
    setListingPurpose: vi.fn(),
    fieldVisible: makeFieldVisible(RESIDENTIAL_VISIBLE),
    isCommercialType: false,
    handleStep1Save: vi.fn(),
    isSaving: false,
    ...overrides,
  };

  return {
    view: {
      basics: {
        title: flat.title,
        description: flat.description,
        locality: flat.locality,
        priceRupees: flat.priceRupees,
        propertyType: flat.propertyType,
        listingPurpose: flat.listingPurpose,
        reraNumber: flat.reraNumber,
      },
      dimensions: {
        landArea: { value: flat.landArea, unit: flat.landAreaUnit },
        builtArea: { value: flat.builtArea, unit: flat.builtAreaUnit },
        carpetArea: { value: flat.shared.values.carpetArea, unit: flat.shared.values.carpetAreaUnit },
        bedrooms: flat.bedrooms,
      },
      capabilities: {
        isCommercialType: flat.isCommercialType,
        commercialSubtype: flat.commercialSubtype,
        fieldVisible: flat.fieldVisible,
      },
      status: { isSaving: flat.isSaving },
      agri: flat.agri.values,
      commercial: flat.commercial.values,
      rent: flat.rent.values,
      residential: flat.residential.values,
      shared: flat.shared.values,
    },
    commands: {
      workflow: { save: flat.handleStep1Save },
      basics: {
        setTitle: flat.setTitle,
        setDescription: flat.setDescription,
        setLocality: flat.setLocality,
        setPriceRupees: flat.setPriceRupees,
        setListingPurpose: flat.setListingPurpose,
        setReraNumber: flat.setReraNumber,
        changePropertyType: flat.changePropertyType,
        markTitleManuallyEdited: flat.markTitleManuallyEdited,
      },
      dimensions: {
        setLandArea: flat.setLandArea,
        setBuiltArea: flat.setBuiltArea,
        setCarpetArea: (value, unit) => {
          flat.shared.setters.setCarpetArea(value);
          flat.shared.setters.setCarpetAreaUnit(unit);
        },
        setBedrooms: flat.setBedrooms,
      },
      agri: flat.agri.setters,
      commercial: flat.commercial.setters,
      rent: flat.rent.setters,
      residential: flat.residential.setters,
      shared: flat.shared.setters,
    },
  };
}

/** Ordered list of every `data-testid` value in the rendered tree, in DOM order. */
function testIdOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid]')).map(
    (el) => el.getAttribute('data-testid') ?? '',
  );
}

describe('DescribeStep — DOM-order oracle (Issue #1838 PR A)', () => {
  it('house / sale: renders sections in the recorded order', () => {
    const { container } = render(
      <DescribeStep
        {...baseProps({
          propertyType: 'house',
          fieldVisible: makeFieldVisible(RESIDENTIAL_VISIBLE),
        })}
      />,
    );
    expect(testIdOrder(container)).toEqual([
      'chip-group-bathrooms',
      'chip-group-balconies',
      'chip-group-parking2wCount',
      'chip-group-parking4wCount',
      'chip-group-amenities',
      'chip-group-maintenanceIncluded',
    ]);
  });

  it('commercial / SHOP / sale: renders sections in the recorded order', () => {
    const { container } = render(
      <DescribeStep
        {...baseProps({
          propertyType: 'commercial',
          commercialSubtype: 'SHOP',
          isCommercialType: true,
          fieldVisible: makeFieldVisible(COMMERCIAL_SHOP_VISIBLE),
        })}
      />,
    );
    expect(testIdOrder(container)).toEqual([
      'chip-group-washroomsPublic',
      'chip-group-washroomsPrivate',
      'chip-group-parkingPublicCount',
      'chip-group-parkingPrivateCount',
      'chip-group-commercialFurnishingStatus',
      'chip-group-utilities',
      'chip-group-suitable-uses',
    ]);
  });

  it('agricultural_land / sale: renders sections in the recorded order (crop chips present)', () => {
    const { container } = render(
      <DescribeStep
        {...baseProps({
          propertyType: 'agricultural_land',
          fieldVisible: makeFieldVisible(AGRI_VISIBLE),
        })}
      />,
    );
    expect(testIdOrder(container)).toEqual([
      'agri-fields-section',
      'chip-group-agri-crops',
      'chip-group-bathrooms',
      'chip-group-balconies',
      'chip-group-parking2wCount',
      'chip-group-parking4wCount',
      'chip-group-amenities',
      'chip-group-maintenanceIncluded',
    ]);
  });
});
