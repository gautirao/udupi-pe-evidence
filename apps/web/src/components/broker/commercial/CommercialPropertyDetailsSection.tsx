import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaField } from '@/components/broker/AreaField';
import { FieldPairRow } from '@/components/broker/residential/FieldPairRow';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import {
  COMMERCIAL_FLOOR_CHOICE_OPTIONS,
  COMMERCIAL_FLOOR_MODE_OPTIONS,
  COMMERCIAL_OCCUPANCY_STATUS_OPTIONS,
  COMMERCIAL_OWNERSHIP_OPTIONS,
  WAREHOUSE_FLOORING_OPTIONS,
  COMMERCIAL_AREA_UNIT_OPTIONS,
} from '@/lib/listing-constants';
import { Field, BoolSwitch, Section } from './CommercialFormPrimitives';

export interface CommercialPropertyDetailsSectionProps {
  fieldVisible: (key: ListingFieldKey) => boolean;
  hubTypeOptions: readonly { value: string; label: string }[];

  isLand: boolean;
  landArea: number | null;
  landAreaUnit: string;
  onLandAreaChange: (a: number | null, u: string) => void;
  builtArea: number | null;
  builtAreaUnit: string;
  onBuiltAreaChange: (a: number | null, u: string) => void;
  commercialAreaUnit: string;
  onCommercialAreaUnitChange: (v: string) => void;

  floorChoice: string;
  onFloorChoiceChange: (v: string) => void;
  hubType: string;
  onHubTypeChange: (v: string) => void;

  officeSeats: string;
  onOfficeSeatsChange: (v: string) => void;
  officeCabins: string;
  onOfficeCabinsChange: (v: string) => void;
  officeMeetingRooms: string;
  onOfficeMeetingRoomsChange: (v: string) => void;

  floorMode: string;
  onFloorModeChange: (v: string) => void;
  powerLoadKva: string;
  onPowerLoadKvaChange: (v: string) => void;
  occupancyStatus: string;
  onOccupancyStatusChange: (v: string) => void;

  warehouseClearHeightFt: string;
  onWarehouseClearHeightFtChange: (v: string) => void;
  warehouseLoadingBays: string;
  onWarehouseLoadingBaysChange: (v: string) => void;
  warehouseFlooring: string;
  onWarehouseFlooringChange: (v: string) => void;
  warehouseTruckAccess: boolean | null;
  onWarehouseTruckAccessChange: (v: boolean) => void;

  commercialZoning: string;
  onCommercialZoningChange: (v: string) => void;
  commercialOwnership: string;
  onCommercialOwnershipChange: (v: string) => void;
  commercialApprovalsText: string;
  onCommercialApprovalsTextChange: (v: string) => void;
}

/** #2388 — Section 3: subtype-adaptive property details (SHOP/OFFICE/BUILDING/WAREHOUSE/LAND). */
export function CommercialPropertyDetailsSection(props: CommercialPropertyDetailsSectionProps) {
  const { fieldVisible, hubTypeOptions } = props;

  return (
    <Section number={3} title="Property details">
      {props.isLand ? (
        <AreaField id="landArea" label="Land area" propertyType="land" initialArea={props.landArea} initialUnit={props.landAreaUnit} onChange={props.onLandAreaChange} />
      ) : (
        <AreaField id="builtArea" label="Built area" propertyType="commercial" initialArea={props.builtArea} initialUnit={props.builtAreaUnit} onChange={props.onBuiltAreaChange} />
      )}

      {fieldVisible('commercialAreaUnit') && (
        <Field id="commercialAreaUnit" label="Area unit (listing display)">
          <Select value={props.commercialAreaUnit} onValueChange={props.onCommercialAreaUnitChange}>
            <SelectTrigger id="commercialAreaUnit" className="h-11"><SelectValue placeholder="Select unit" /></SelectTrigger>
            <SelectContent>
              {COMMERCIAL_AREA_UNIT_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}

      {/* SHOP / OFFICE */}
      {(fieldVisible('floorChoice') || fieldVisible('hubType')) && (
        <FieldPairRow>
          {fieldVisible('floorChoice') && (
            <Field id="floorChoice" label="Floor">
              <Select value={props.floorChoice} onValueChange={props.onFloorChoiceChange}>
                <SelectTrigger id="floorChoice" className="h-11"><SelectValue placeholder="Select floor" /></SelectTrigger>
                <SelectContent>
                  {COMMERCIAL_FLOOR_CHOICE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {fieldVisible('hubType') && (
            <Field id="hubType" label="Location type">
              <Select value={props.hubType} onValueChange={props.onHubTypeChange}>
                <SelectTrigger id="hubType" className="h-11"><SelectValue placeholder="Select location type" /></SelectTrigger>
                <SelectContent>
                  {hubTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
        </FieldPairRow>
      )}

      {/* OFFICE only */}
      {(fieldVisible('officeSeats') || fieldVisible('officeCabins') || fieldVisible('officeMeetingRooms')) && (
        <div className="grid grid-cols-3 gap-4">
          {fieldVisible('officeSeats') && (
            <Field id="officeSeats" label="Seats">
              <Input id="officeSeats" type="number" min="0" className="h-11 font-mono" value={props.officeSeats} onChange={(e) => props.onOfficeSeatsChange(e.target.value)} />
            </Field>
          )}
          {fieldVisible('officeCabins') && (
            <Field id="officeCabins" label="Cabins">
              <Input id="officeCabins" type="number" min="0" className="h-11 font-mono" value={props.officeCabins} onChange={(e) => props.onOfficeCabinsChange(e.target.value)} />
            </Field>
          )}
          {fieldVisible('officeMeetingRooms') && (
            <Field id="officeMeetingRooms" label="Meeting rooms">
              <Input id="officeMeetingRooms" type="number" min="0" className="h-11 font-mono" value={props.officeMeetingRooms} onChange={(e) => props.onOfficeMeetingRoomsChange(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      {/* BUILDING only */}
      {fieldVisible('floorMode') && (
        <Field id="floorMode" label="Floors available">
          <Select value={props.floorMode} onValueChange={props.onFloorModeChange}>
            <SelectTrigger id="floorMode" className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {COMMERCIAL_FLOOR_MODE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {/* powerLoadKva is BUILDING-only; occupancyStatus is SHOP + BUILDING (see fieldVisible) */}
      {(fieldVisible('powerLoadKva') || fieldVisible('occupancyStatus')) && (
        <FieldPairRow>
          {fieldVisible('powerLoadKva') && (
            <Field id="powerLoadKva" label="Power load (KVA)">
              <Input id="powerLoadKva" type="number" min="0" step="any" className="h-11 font-mono" value={props.powerLoadKva} onChange={(e) => props.onPowerLoadKvaChange(e.target.value)} />
            </Field>
          )}
          {fieldVisible('occupancyStatus') && (
            <Field id="occupancyStatus" label="Occupancy status">
              <Select value={props.occupancyStatus} onValueChange={props.onOccupancyStatusChange}>
                <SelectTrigger id="occupancyStatus" className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {COMMERCIAL_OCCUPANCY_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
        </FieldPairRow>
      )}

      {/* WAREHOUSE only */}
      {(fieldVisible('warehouseClearHeightFt') || fieldVisible('warehouseLoadingBays')) && (
        <FieldPairRow>
          {fieldVisible('warehouseClearHeightFt') && (
            <Field id="warehouseClearHeightFt" label="Clear height (ft)">
              <Input id="warehouseClearHeightFt" type="number" min="0" step="any" className="h-11 font-mono" value={props.warehouseClearHeightFt} onChange={(e) => props.onWarehouseClearHeightFtChange(e.target.value)} />
            </Field>
          )}
          {fieldVisible('warehouseLoadingBays') && (
            <Field id="warehouseLoadingBays" label="Loading bays">
              <Input id="warehouseLoadingBays" type="number" min="0" className="h-11 font-mono" value={props.warehouseLoadingBays} onChange={(e) => props.onWarehouseLoadingBaysChange(e.target.value)} />
            </Field>
          )}
        </FieldPairRow>
      )}
      {fieldVisible('warehouseFlooring') && (
        <Field id="warehouseFlooring" label="Flooring">
          <Select value={props.warehouseFlooring} onValueChange={props.onWarehouseFlooringChange}>
            <SelectTrigger id="warehouseFlooring" className="h-11"><SelectValue placeholder="Select flooring" /></SelectTrigger>
            <SelectContent>
              {WAREHOUSE_FLOORING_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {fieldVisible('warehouseTruckAccess') && (
        <BoolSwitch id="warehouseTruckAccess" label="Truck access" value={props.warehouseTruckAccess} onChange={props.onWarehouseTruckAccessChange} />
      )}

      {/* LAND only */}
      {fieldVisible('commercialZoning') && (
        <Field id="commercialZoning" label="Zoning">
          <Input id="commercialZoning" placeholder="e.g. Commercial zone" value={props.commercialZoning} onChange={(e) => props.onCommercialZoningChange(e.target.value)} className="h-11" />
        </Field>
      )}
      {fieldVisible('commercialOwnership') && (
        <Field id="commercialOwnership" label="Ownership">
          <Select value={props.commercialOwnership} onValueChange={props.onCommercialOwnershipChange}>
            <SelectTrigger id="commercialOwnership" className="h-11"><SelectValue placeholder="Select ownership" /></SelectTrigger>
            <SelectContent>
              {COMMERCIAL_OWNERSHIP_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {fieldVisible('commercialApprovals') && (
        <Field id="commercialApprovals" label="Approvals" hint="Comma-separated, e.g. Building plan approved, Fire NOC">
          <Input id="commercialApprovals" value={props.commercialApprovalsText} onChange={(e) => props.onCommercialApprovalsTextChange(e.target.value)} className="h-11" />
        </Field>
      )}
    </Section>
  );
}
