// Extracted verbatim from DescribeStep.tsx:1049-1397 — no gate logic changed.
// Issue #1838 PR D — internal split of DescribeStep into per-domain sections.
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  // #2281 [#1684 parity] — commercial subtype-gated option vocabularies
  // (mirrors CommercialListingForm.tsx's imports exactly — same source of
  // truth, verified server-side by ListingFieldOptionsContractTest).
  COMMERCIAL_SUBTYPE_OPTIONS,
  COMMERCIAL_FLOOR_CHOICE_OPTIONS,
  COMMERCIAL_FLOOR_MODE_OPTIONS,
  SHOP_HUB_TYPE_OPTIONS,
  OFFICE_HUB_TYPE_OPTIONS,
  SHOP_SUITABLE_USE_OPTIONS,
  OFFICE_SUITABLE_USE_OPTIONS,
  BUILDING_SUITABLE_USE_OPTIONS,
  WAREHOUSE_SUITABLE_USE_OPTIONS,
  LAND_SUITABLE_USE_OPTIONS,
  COMMERCIAL_UTILITY_OPTIONS,
  COMMERCIAL_OCCUPANCY_STATUS_OPTIONS,
  COMMERCIAL_FURNISHING_STATUS_OPTIONS,
  COMMERCIAL_OWNERSHIP_OPTIONS,
  COMMERCIAL_AVAILABILITY_OPTIONS,
  WAREHOUSE_FLOORING_OPTIONS,
  COMMERCIAL_AREA_UNIT_OPTIONS,
} from '@/lib/listing-constants';
import { SingleChipGroup, MultiChipGroup, PARKING_CHIP_OPTIONS } from '../../chipGroups';
import type { ListingFieldKey, CommercialSubtype } from '@/lib/listingFieldConfig';
import type { CommercialFieldValues, CommercialFieldSetters } from '../../useCommercialFields';
import type { FieldSlice } from '../stepContracts';

// #2281 [#1684 parity] — mirrors CommercialListingForm.tsx's SUBTYPE_CHOICE_OPTIONS /
// suitableUseOptionsFor / hubTypeOptionsFor exactly (same vocabulary, same derivation).
// Relocated here from DescribeStep.tsx (Issue #1838 PR D) — used only by this section now.
const SUBTYPE_CHOICE_OPTIONS = COMMERCIAL_SUBTYPE_OPTIONS.filter((o) => o.value === 'SHOP' || o.value === 'OFFICE');

function suitableUseOptionsFor(subtype: CommercialSubtype | undefined) {
  switch (subtype) {
    case 'SHOP': return SHOP_SUITABLE_USE_OPTIONS;
    case 'OFFICE': return OFFICE_SUITABLE_USE_OPTIONS;
    case 'BUILDING': return BUILDING_SUITABLE_USE_OPTIONS;
    case 'WAREHOUSE': return WAREHOUSE_SUITABLE_USE_OPTIONS;
    case 'LAND': return LAND_SUITABLE_USE_OPTIONS;
    default: return [];
  }
}

function hubTypeOptionsFor(subtype: CommercialSubtype | undefined) {
  if (subtype === 'SHOP') return SHOP_HUB_TYPE_OPTIONS;
  if (subtype === 'OFFICE') return OFFICE_HUB_TYPE_OPTIONS;
  return [];
}

type CommercialSubtypeValueKeys =
  | 'explicitSubtype' | 'commercialAreaUnit' | 'floorChoice' | 'hubType' | 'floorMode' | 'powerLoadKva'
  | 'occupancyStatus' | 'officeSeats' | 'officeCabins' | 'officeMeetingRooms'
  | 'warehouseClearHeightFt' | 'warehouseLoadingBays' | 'warehouseTruckAccess' | 'warehouseFlooring'
  | 'commercialZoning' | 'commercialOwnership' | 'commercialApprovals'
  | 'washroomsPublic' | 'washroomsPrivate' | 'parkingPublicCount' | 'parkingPrivateCount'
  | 'commercialFurnishingStatus' | 'utilities' | 'suitableUses' | 'commercialAvailability'
  | 'expectedRentalYieldPct' | 'currentMonthlyIncomePaise' | 'leaseTermMonths' | 'leaseEscalationPct';

interface CommercialSubtypeSectionProps {
  commercial: FieldSlice<CommercialFieldValues, CommercialFieldSetters, CommercialSubtypeValueKeys>;
  // #2281 [#1684 parity] — derived (F1: from LIVE propertyType + explicit
  // choice, NEVER from the raw stored listing.commercialSubtype) subtype used
  // to pick per-subtype option vocabularies (suitableUses/hubType) below.
  commercialSubtype: CommercialSubtype | undefined;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/** #2281 [#1684 parity] — commercial subtype-gated fields. Field
 * grouping/input-type choices mirror CommercialListingForm.tsx (Create) —
 * the same shared option vocabularies, the same per-subtype gating via
 * fieldVisible(...), which now carries the F1-derived commercialSubtype. */
export function CommercialSubtypeSection({
  commercial, commercialSubtype, fieldVisible,
}: CommercialSubtypeSectionProps) {
  const {
    explicitSubtype, commercialAreaUnit, floorChoice, hubType, floorMode, powerLoadKva,
    occupancyStatus, officeSeats, officeCabins, officeMeetingRooms,
    warehouseClearHeightFt, warehouseLoadingBays, warehouseTruckAccess, warehouseFlooring,
    commercialZoning, commercialOwnership, commercialApprovals,
    washroomsPublic, washroomsPrivate, parkingPublicCount, parkingPrivateCount,
    commercialFurnishingStatus, utilities, suitableUses,
    commercialAvailability, expectedRentalYieldPct, currentMonthlyIncomePaise,
    leaseTermMonths, leaseEscalationPct,
  } = commercial.values;
  const {
    setExplicitSubtype, setCommercialAreaUnit, setFloorChoice, setHubType, setFloorMode, setPowerLoadKva,
    setOccupancyStatus, setOfficeSeats, setOfficeCabins, setOfficeMeetingRooms,
    setWarehouseClearHeightFt, setWarehouseLoadingBays, setWarehouseTruckAccess, setWarehouseFlooring,
    setCommercialZoning, setCommercialOwnership, setCommercialApprovals,
    setWashroomsPublic, setWashroomsPrivate, setParkingPublicCount, setParkingPrivateCount,
    setCommercialFurnishingStatus, setUtilities, setSuitableUses,
    setCommercialAvailability, setExpectedRentalYieldPct, setCurrentMonthlyIncomePaise,
    setLeaseTermMonths, setLeaseEscalationPct,
  } = commercial.setters;

  return (
    <>
      {/* Explicit SHOP/OFFICE choice — 'commercial' propertyType only. */}
      {fieldVisible('commercialSubtype') && (
        <div className="space-y-2">
          <Label htmlFor="commercialSubtype">Is this a shop or an office?</Label>
          <Select value={explicitSubtype} onValueChange={(v) => setExplicitSubtype(v as '' | 'SHOP' | 'OFFICE')}>
            <SelectTrigger id="commercialSubtype">
              <SelectValue placeholder="Select subtype" />
            </SelectTrigger>
            <SelectContent>
              {SUBTYPE_CHOICE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Area unit (listing display) — every resolved commercial subtype. */}
      {fieldVisible('commercialAreaUnit') && (
        <div className="space-y-2">
          <Label htmlFor="commercialAreaUnit">Area unit (listing display)</Label>
          <Select value={commercialAreaUnit} onValueChange={setCommercialAreaUnit}>
            <SelectTrigger id="commercialAreaUnit">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {COMMERCIAL_AREA_UNIT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* SHOP / OFFICE only */}
      {(fieldVisible('floorChoice') || fieldVisible('hubType')) && (
        <div className="grid grid-cols-2 gap-4">
          {fieldVisible('floorChoice') && (
            <div className="space-y-2">
              <Label htmlFor="floorChoice">Floor</Label>
              <Select value={floorChoice} onValueChange={setFloorChoice}>
                <SelectTrigger id="floorChoice">
                  <SelectValue placeholder="Select floor" />
                </SelectTrigger>
                <SelectContent>
                  {COMMERCIAL_FLOOR_CHOICE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {fieldVisible('hubType') && (
            <div className="space-y-2">
              <Label htmlFor="hubType">Location type</Label>
              <Select value={hubType} onValueChange={setHubType}>
                <SelectTrigger id="hubType">
                  <SelectValue placeholder="Select location type" />
                </SelectTrigger>
                <SelectContent>
                  {hubTypeOptionsFor(commercialSubtype).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* OFFICE only */}
      {(fieldVisible('officeSeats') || fieldVisible('officeCabins') || fieldVisible('officeMeetingRooms')) && (
        <div className="grid grid-cols-3 gap-4">
          {fieldVisible('officeSeats') && (
            <div className="space-y-2">
              <Label htmlFor="officeSeats">Seats</Label>
              <Input id="officeSeats" type="number" min="0" value={officeSeats} onChange={(e) => setOfficeSeats(e.target.value)} />
            </div>
          )}
          {fieldVisible('officeCabins') && (
            <div className="space-y-2">
              <Label htmlFor="officeCabins">Cabins</Label>
              <Input id="officeCabins" type="number" min="0" value={officeCabins} onChange={(e) => setOfficeCabins(e.target.value)} />
            </div>
          )}
          {fieldVisible('officeMeetingRooms') && (
            <div className="space-y-2">
              <Label htmlFor="officeMeetingRooms">Meeting rooms</Label>
              <Input id="officeMeetingRooms" type="number" min="0" value={officeMeetingRooms} onChange={(e) => setOfficeMeetingRooms(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {/* BUILDING only (floorMode); powerLoadKva is BUILDING-only, occupancyStatus is SHOP + BUILDING. */}
      {fieldVisible('floorMode') && (
        <div className="space-y-2">
          <Label htmlFor="floorMode">Floors available</Label>
          <Select value={floorMode} onValueChange={setFloorMode}>
            <SelectTrigger id="floorMode">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {COMMERCIAL_FLOOR_MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {(fieldVisible('powerLoadKva') || fieldVisible('occupancyStatus')) && (
        <div className="grid grid-cols-2 gap-4">
          {fieldVisible('powerLoadKva') && (
            <div className="space-y-2">
              <Label htmlFor="powerLoadKva">Power load (KVA)</Label>
              <Input id="powerLoadKva" type="number" min="0" step="any" value={powerLoadKva} onChange={(e) => setPowerLoadKva(e.target.value)} />
            </div>
          )}
          {fieldVisible('occupancyStatus') && (
            <div className="space-y-2">
              <Label htmlFor="occupancyStatus">Occupancy status</Label>
              <Select value={occupancyStatus} onValueChange={setOccupancyStatus}>
                <SelectTrigger id="occupancyStatus">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {COMMERCIAL_OCCUPANCY_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* WAREHOUSE only */}
      {(fieldVisible('warehouseClearHeightFt') || fieldVisible('warehouseLoadingBays')) && (
        <div className="grid grid-cols-2 gap-4">
          {fieldVisible('warehouseClearHeightFt') && (
            <div className="space-y-2">
              <Label htmlFor="warehouseClearHeightFt">Clear height (ft)</Label>
              <Input id="warehouseClearHeightFt" type="number" min="0" step="any" value={warehouseClearHeightFt} onChange={(e) => setWarehouseClearHeightFt(e.target.value)} />
            </div>
          )}
          {fieldVisible('warehouseLoadingBays') && (
            <div className="space-y-2">
              <Label htmlFor="warehouseLoadingBays">Loading bays</Label>
              <Input id="warehouseLoadingBays" type="number" min="0" value={warehouseLoadingBays} onChange={(e) => setWarehouseLoadingBays(e.target.value)} />
            </div>
          )}
        </div>
      )}
      {fieldVisible('warehouseFlooring') && (
        <div className="space-y-2">
          <Label htmlFor="warehouseFlooring">Flooring</Label>
          <Select value={warehouseFlooring} onValueChange={setWarehouseFlooring}>
            <SelectTrigger id="warehouseFlooring">
              <SelectValue placeholder="Select flooring" />
            </SelectTrigger>
            <SelectContent>
              {WAREHOUSE_FLOORING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {fieldVisible('warehouseTruckAccess') && (
        <div className="space-y-2">
          <Label htmlFor="warehouseTruckAccess">Truck access</Label>
          <Select value={warehouseTruckAccess} onValueChange={setWarehouseTruckAccess}>
            <SelectTrigger id="warehouseTruckAccess">
              <SelectValue placeholder="Not specified" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* LAND only */}
      {fieldVisible('commercialZoning') && (
        <div className="space-y-2">
          <Label htmlFor="commercialZoning">Zoning</Label>
          <Input id="commercialZoning" placeholder="e.g. Commercial zone" value={commercialZoning} onChange={(e) => setCommercialZoning(e.target.value)} />
        </div>
      )}
      {fieldVisible('commercialOwnership') && (
        <div className="space-y-2">
          <Label htmlFor="commercialOwnership">Ownership</Label>
          <Select value={commercialOwnership} onValueChange={setCommercialOwnership}>
            <SelectTrigger id="commercialOwnership">
              <SelectValue placeholder="Select ownership" />
            </SelectTrigger>
            <SelectContent>
              {COMMERCIAL_OWNERSHIP_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {fieldVisible('commercialApprovals') && (
        <div className="space-y-2">
          <Label htmlFor="commercialApprovals">Approvals</Label>
          <Input
            id="commercialApprovals"
            placeholder="e.g. Building plan approved, Fire NOC"
            value={commercialApprovals}
            onChange={(e) => setCommercialApprovals(e.target.value)}
          />
        </div>
      )}

      {/* Built-space fields — every resolved subtype EXCEPT LAND. */}
      {(fieldVisible('washroomsPublic') || fieldVisible('washroomsPrivate')) && (
        <div className="grid grid-cols-2 gap-4">
          {fieldVisible('washroomsPublic') && (
            <SingleChipGroup
              id="washroomsPublic"
              label="Public washrooms"
              options={PARKING_CHIP_OPTIONS}
              value={washroomsPublic}
              onValueChange={setWashroomsPublic}
            />
          )}
          {fieldVisible('washroomsPrivate') && (
            <SingleChipGroup
              id="washroomsPrivate"
              label="Private washrooms"
              options={PARKING_CHIP_OPTIONS}
              value={washroomsPrivate}
              onValueChange={setWashroomsPrivate}
            />
          )}
        </div>
      )}
      {(fieldVisible('parkingPublicCount') || fieldVisible('parkingPrivateCount')) && (
        <div className="grid grid-cols-2 gap-4">
          {fieldVisible('parkingPublicCount') && (
            <SingleChipGroup
              id="parkingPublicCount"
              label="Public parking"
              options={PARKING_CHIP_OPTIONS}
              value={parkingPublicCount}
              onValueChange={setParkingPublicCount}
            />
          )}
          {fieldVisible('parkingPrivateCount') && (
            <SingleChipGroup
              id="parkingPrivateCount"
              label="Private parking"
              options={PARKING_CHIP_OPTIONS}
              value={parkingPrivateCount}
              onValueChange={setParkingPrivateCount}
            />
          )}
        </div>
      )}
      {fieldVisible('commercialFurnishingStatus') && (
        <SingleChipGroup
          id="commercialFurnishingStatus"
          label="Furnishing"
          variant="segmented"
          options={COMMERCIAL_FURNISHING_STATUS_OPTIONS}
          value={commercialFurnishingStatus}
          onValueChange={setCommercialFurnishingStatus}
        />
      )}
      {fieldVisible('utilities') && (
        <MultiChipGroup
          testId="chip-group-utilities"
          label="Utilities"
          options={COMMERCIAL_UTILITY_OPTIONS}
          value={utilities ?? []}
          onValueChange={setUtilities}
        />
      )}

      {/* Every resolved subtype, LAND included. */}
      {fieldVisible('suitableUses') && (
        <MultiChipGroup
          testId="chip-group-suitable-uses"
          label="Suitable for"
          options={suitableUseOptionsFor(commercialSubtype)}
          value={suitableUses ?? []}
          onValueChange={setSuitableUses}
        />
      )}
      {fieldVisible('commercialAvailability') && (
        <div className="space-y-2">
          <Label htmlFor="commercialAvailability">Availability</Label>
          <Select value={commercialAvailability} onValueChange={setCommercialAvailability}>
            <SelectTrigger id="commercialAvailability">
              <SelectValue placeholder="Select availability" />
            </SelectTrigger>
            <SelectContent>
              {COMMERCIAL_AVAILABILITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Purpose-gated commercial financials — sale vs rent/lease (design mirrors
          #1730's validateCommercialFields purpose gate). */}
      {(fieldVisible('expectedRentalYieldPct') || fieldVisible('currentMonthlyIncomePaise')) && (
        <div className="grid grid-cols-2 gap-4">
          {fieldVisible('expectedRentalYieldPct') && (
            <div className="space-y-2">
              <Label htmlFor="expectedRentalYieldPct">Expected rental yield (%)</Label>
              <Input id="expectedRentalYieldPct" type="number" min="0" step="any" value={expectedRentalYieldPct} onChange={(e) => setExpectedRentalYieldPct(e.target.value)} />
            </div>
          )}
          {fieldVisible('currentMonthlyIncomePaise') && (
            <div className="space-y-2">
              <Label htmlFor="currentMonthlyIncomePaise">Current monthly income (₹)</Label>
              <Input id="currentMonthlyIncomePaise" type="number" min="0" value={currentMonthlyIncomePaise} onChange={(e) => setCurrentMonthlyIncomePaise(e.target.value)} />
            </div>
          )}
        </div>
      )}
      {(fieldVisible('leaseTermMonths') || fieldVisible('leaseEscalationPct')) && (
        <div className="grid grid-cols-2 gap-4">
          {fieldVisible('leaseTermMonths') && (
            <div className="space-y-2">
              <Label htmlFor="leaseTermMonths">Lease term (months)</Label>
              <Input id="leaseTermMonths" type="number" min="0" value={leaseTermMonths} onChange={(e) => setLeaseTermMonths(e.target.value)} />
            </div>
          )}
          {fieldVisible('leaseEscalationPct') && (
            <div className="space-y-2">
              <Label htmlFor="leaseEscalationPct">Lease escalation (%)</Label>
              <Input id="leaseEscalationPct" type="number" min="0" step="any" value={leaseEscalationPct} onChange={(e) => setLeaseEscalationPct(e.target.value)} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
