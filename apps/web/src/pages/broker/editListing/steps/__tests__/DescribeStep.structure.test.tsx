/**
 * DescribeStep — Issue #1838 PR D commit 1: structural characterisation test.
 *
 * This is the regression oracle for the whole internal split (PR D): it is
 * written against the CURRENT (pre-split) DescribeStep.tsx and must stay
 * green, unmodified, through every extraction commit that follows. Two
 * BLOCKING requirements a naive single-render snapshot cannot satisfy alone:
 *
 * BLOCKER 1 — remount detection. If an extracted section ends up declared
 * INSIDE DescribeStep's render body (or as a fresh inline arrow) instead of
 * at module scope in its own file, React gives it a new identity on every
 * parent re-render and remounts it — every field inside loses its typed
 * value AND focus on the next keystroke that triggers a sibling re-render.
 * A single-render snapshot cannot see this (it produces identical HTML at
 * one point in time either way), so this file adds real stateful
 * interaction harnesses (below) that type into a field, force an unrelated
 * parent re-render, and assert the input keeps both its value and its exact
 * DOM node identity.
 *
 * BLOCKER 2 — full HTML structure, not just a testid/id token list. A
 * token-list-of-ids approach cannot detect a section accidentally returning
 * `<div>...</div>` instead of a React fragment `<>...</>`, which would break
 * SectionCard's `space-y-5` Tailwind spacing (space-y only applies margin
 * between DIRECT children — a wrapper div breaks it visually, silently,
 * with zero existing test catching it). This file snapshots the full
 * `container.innerHTML` (normalized for React's useId tokens, which shift
 * when component nesting changes even with zero behavior change) AND, as a
 * belt-and-suspenders secondary assertion, the ordered token list of
 * `[id]`/`[data-testid]` elements (catches reorders even faster than a
 * snapshot diff would).
 *
 * Mutation-check results (recorded 2026-09-26, both reverted before commit):
 * - Blocker 2: temporarily wrapped the `roadFrontageFt` fragment
 *   (DescribeStep.tsx `fieldVisible('roadFrontageFt') && (<>...</>)`) in an
 *   extra `<div>` -> all 10 full-HTML fixture snapshots went red immediately
 *   (this fixture matrix renders with `fieldVisible: () => true`, so every
 *   fixture includes that block). Reverted; snapshots green again.
 * - Blocker 1: temporarily hoisted the agri-fields-section JSX into a local
 *   `const AgriInline = () => (<>...agri JSX...</>)` declared INSIDE
 *   DescribeStep's function body (simulating a mis-extraction that nests a
 *   component inside its parent's render), then rendered it via
 *   `<AgriInline />` in place of the raw JSX -> the "agri survey number
 *   input" interaction test below went red: after `user.type(input,
 *   'ABC123')`, the field only retained the FIRST typed character (the
 *   remaining keystrokes were dispatched against a detached DOM node once
 *   the parent's state update from the first keystroke remounted the
 *   inline component). Reverted; test green again.
 *
 * Reuses the same shadcn Select stub and hook-result-stub factories as
 * DescribeStep.test.tsx / DescribeStep.domOrder.test.tsx (duplicated here
 * rather than imported — test-file setup is local-per-file by convention in
 * this repo).
 */
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DescribeStep } from '../DescribeStep';
import type { PropertyType } from '@/lib/listing-constants';
import type { ListingFieldKey, CommercialSubtype } from '@/lib/listingFieldConfig';
import type { useAgriFields } from '../../useAgriFields';
import type { useCommercialFields } from '../../useCommercialFields';
import type { useRentFields } from '../../useRentFields';
import type { useResidentialFields } from '../../useResidentialFields';
import type { useSharedFields } from '../../useSharedFields';

// Stable module-scope shadcn Select stub — same pattern as DescribeStep.test.tsx
// / DescribeStep.domOrder.test.tsx. Radix Select's popover/portal doesn't open
// via click in jsdom, so the established convention in this codebase is a
// plain-<select> stub.
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

// ─── Hook-result stubs — mirror the real hooks' values/setters/hydrate shape ──

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

/**
 * Every field visible, unconditionally — this suite exists to characterise
 * RENDER STRUCTURE (Blocker 2) and component IDENTITY across re-renders
 * (Blocker 1), not per-propertyType field gating (that's DescribeStep.test.tsx
 * / DescribeStep.domOrder.test.tsx's job). Maximal visibility surfaces every
 * JSX block a section extraction could touch.
 */
const ALWAYS_VISIBLE = () => true;

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
    fieldVisible: ALWAYS_VISIBLE as unknown as (key: ListingFieldKey) => boolean,
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

// ─────────────────────────────────────────────────────────────────────────
// BLOCKER 2 — full HTML structure across a real propertyType/subtype matrix
// ─────────────────────────────────────────────────────────────────────────

/** Normalizes React's useId-generated tokens (":r0:", "«r1»", ...) to a stable
 *  placeholder — these shift when component nesting changes even with zero
 *  behavior change, so a raw diff would be full of noise unrelated to the
 *  refactor's correctness. */
function normalizeUseIds(html: string): string {
  return html.replace(/:r[0-9a-z]+:|«r[0-9a-z]+»/g, '[useid]');
}

/** Ordered token list of every `[id]`/`[data-testid]`-bearing element, in DOM
 *  order — a fast secondary signal that catches a reorder even before a full
 *  snapshot diff would (belt-and-suspenders alongside the HTML snapshot). */
function orderedIdTokens(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[id],[data-testid]')).map((el) => {
    const testId = el.getAttribute('data-testid');
    if (testId) return `testid:${testId}`;
    return `id:${el.getAttribute('id') ?? ''}`;
  });
}

interface StructureFixture {
  name: string;
  propertyType: PropertyType;
  commercialSubtype?: CommercialSubtype;
  isCommercialType?: boolean;
}

// Real breadth across the type union (verified against PROPERTY_TYPES in
// lib/listing-constants.ts and CommercialSubtype in lib/listingFieldConfig.ts).
const STRUCTURE_FIXTURES: StructureFixture[] = [
  { name: 'apartment', propertyType: 'apartment' },
  { name: 'house', propertyType: 'house' },
  { name: 'villa', propertyType: 'villa' },
  { name: 'residential_plot', propertyType: 'residential_plot' },
  {
    name: 'commercial_building (subtype BUILDING)',
    propertyType: 'commercial_building',
    commercialSubtype: 'BUILDING',
    isCommercialType: true,
  },
  {
    name: 'commercial (subtype SHOP)',
    propertyType: 'commercial',
    commercialSubtype: 'SHOP',
    isCommercialType: true,
  },
  {
    name: 'commercial (subtype OFFICE)',
    propertyType: 'commercial',
    commercialSubtype: 'OFFICE',
    isCommercialType: true,
  },
  {
    name: 'commercial_land (subtype LAND)',
    propertyType: 'commercial_land',
    commercialSubtype: 'LAND',
    isCommercialType: true,
  },
  {
    name: 'warehouse (subtype WAREHOUSE)',
    propertyType: 'warehouse',
    commercialSubtype: 'WAREHOUSE',
    isCommercialType: true,
  },
  { name: 'agricultural_land', propertyType: 'agricultural_land' },
];

describe('DescribeStep — full HTML structure (Issue #1838 PR D, Blocker 2)', () => {
  it.each(STRUCTURE_FIXTURES)(
    '$name: container HTML structure matches recorded golden master',
    (fixture) => {
      const { container } = render(
        <DescribeStep
          {...baseProps({
            propertyType: fixture.propertyType,
            commercialSubtype: fixture.commercialSubtype,
            isCommercialType: fixture.isCommercialType ?? false,
            fieldVisible: ALWAYS_VISIBLE as unknown as (key: ListingFieldKey) => boolean,
          })}
        />,
      );
      expect(normalizeUseIds(container.innerHTML)).toMatchSnapshot('full-html');
      expect(orderedIdTokens(container)).toMatchSnapshot('id-token-order');
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────
// BLOCKER 1 — remount detection via a real stateful interaction harness.
//
// Each harness owns REAL useState for exactly one field (mirroring how
// EditListingForm really owns the domain hooks) so typed characters actually
// round-trip through the controlled <input>. A mocked (non-reactive) setter
// cannot exercise this: the DOM value would never change regardless of a
// remount bug, since the fed-back `value` prop would never move off ''.
// Every OTHER prop passed to DescribeStep stays a plain mock, per baseProps.
// ─────────────────────────────────────────────────────────────────────────

function AgriSurveyNumberHarness() {
  const [surveyNumber, setSurveyNumber] = useState('');
  const [locality, setLocality] = useState('initial-locality');
  const agri = makeAgri({ surveyNumber });
  agri.setters.setSurveyNumber = setSurveyNumber;
  return (
    <div>
      <DescribeStep
        {...baseProps({
          propertyType: 'agricultural_land',
          fieldVisible: ALWAYS_VISIBLE as unknown as (key: ListingFieldKey) => boolean,
          agri,
          locality,
        })}
      />
      {/* Unrelated prop change — forces a parent re-render that has nothing to
          do with the agri section, exactly the scenario a remount bug breaks. */}
      <button type="button" onClick={() => setLocality('Udupi')}>
        bump-locality
      </button>
    </div>
  );
}

function CommercialZoningHarness() {
  const [commercialZoning, setCommercialZoning] = useState('');
  const [locality, setLocality] = useState('initial-locality');
  const commercial = makeCommercial({ commercialZoning });
  commercial.setters.setCommercialZoning = setCommercialZoning;
  return (
    <div>
      <DescribeStep
        {...baseProps({
          propertyType: 'commercial_land',
          commercialSubtype: 'LAND',
          isCommercialType: true,
          fieldVisible: ALWAYS_VISIBLE as unknown as (key: ListingFieldKey) => boolean,
          commercial,
          locality,
        })}
      />
      <button type="button" onClick={() => setLocality('Udupi')}>
        bump-locality
      </button>
    </div>
  );
}

describe('DescribeStep — remount safety (Issue #1838 PR D, Blocker 1)', () => {
  it('agri survey number input keeps its value and DOM identity across an unrelated parent re-render', async () => {
    const user = userEvent.setup();
    render(<AgriSurveyNumberHarness />);

    const input = screen.getByLabelText(/survey number/i);
    await user.type(input, 'ABC123');
    expect(input).toHaveValue('ABC123');

    await user.click(screen.getByRole('button', { name: 'bump-locality' }));

    const inputAfterRerender = screen.getByLabelText(/survey number/i);
    expect(inputAfterRerender).toHaveValue('ABC123');
    expect(inputAfterRerender).toBe(input); // SAME DOM node — not replaced/remounted

    // Keeps accepting input after the unrelated re-render (focus wasn't lost).
    await user.type(inputAfterRerender, 'XYZ');
    expect(inputAfterRerender).toHaveValue('ABC123XYZ');
  });

  it('commercial LAND zoning input keeps its value and DOM identity across an unrelated parent re-render', async () => {
    const user = userEvent.setup();
    render(<CommercialZoningHarness />);

    const input = screen.getByLabelText(/zoning/i);
    await user.type(input, 'Retail Zone');
    expect(input).toHaveValue('Retail Zone');

    await user.click(screen.getByRole('button', { name: 'bump-locality' }));

    const inputAfterRerender = screen.getByLabelText(/zoning/i);
    expect(inputAfterRerender).toHaveValue('Retail Zone');
    expect(inputAfterRerender).toBe(input);
  });
});
