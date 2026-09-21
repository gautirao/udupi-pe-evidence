import { useState, useEffect, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AreaChip {
  label: string;
  value: number;
  unit: string;
}

type AreaPropertyType = 'land' | 'house' | 'apartment' | 'commercial' | 'agricultural_land';

export interface AreaFieldProps {
  id?: string;
  label?: string;
  propertyType: AreaPropertyType;
  initialArea?: number | null;
  initialUnit?: string | null;
  onChange: (area: number | null, unit: string) => void;
  required?: boolean;
}

// ─── Chip config per property type ──────────────────────────────────────────

/**
 * Exported so other area inputs (e.g. CarpetAreaInput, #2642) can reuse the
 * same preset chip sets without duplicating the table or swapping to
 * AreaField wholesale (which hardcodes its own `required` styling, label
 * defaults, and conversion line — see ResidentialFormPrimitives.tsx).
 */
export const AREA_CHIPS: Record<AreaPropertyType, AreaChip[]> = {
  land: [
    { label: '30\u00d740', value: 2.75, unit: 'cent' },
    { label: '5 cents', value: 5, unit: 'cent' },
    { label: '40\u00d760', value: 5.5, unit: 'cent' },
    { label: '10 cents', value: 10, unit: 'cent' },
    { label: '15 cents', value: 15, unit: 'cent' },
    { label: '20 cents', value: 20, unit: 'cent' },
    { label: '30 cents', value: 30, unit: 'cent' },
  ],
  house: [
    { label: '800 sqft', value: 800, unit: 'sqft' },
    { label: '1,000 sqft', value: 1000, unit: 'sqft' },
    { label: '1,200 sqft', value: 1200, unit: 'sqft' },
    { label: '1,500 sqft', value: 1500, unit: 'sqft' },
    { label: '2,000 sqft', value: 2000, unit: 'sqft' },
    { label: '2,500 sqft', value: 2500, unit: 'sqft' },
    { label: '3,000 sqft', value: 3000, unit: 'sqft' },
  ],
  apartment: [
    { label: '600 sqft', value: 600, unit: 'sqft' },
    { label: '800 sqft', value: 800, unit: 'sqft' },
    { label: '1,000 sqft', value: 1000, unit: 'sqft' },
    { label: '1,200 sqft', value: 1200, unit: 'sqft' },
    { label: '1,500 sqft', value: 1500, unit: 'sqft' },
    { label: '2,000 sqft', value: 2000, unit: 'sqft' },
  ],
  commercial: [
    { label: '200 sqft', value: 200, unit: 'sqft' },
    { label: '500 sqft', value: 500, unit: 'sqft' },
    { label: '800 sqft', value: 800, unit: 'sqft' },
    { label: '1,000 sqft', value: 1000, unit: 'sqft' },
    { label: '1,500 sqft', value: 1500, unit: 'sqft' },
    { label: '2,000 sqft', value: 2000, unit: 'sqft' },
    { label: '3,000 sqft', value: 3000, unit: 'sqft' },
  ],
  agricultural_land: [
    { label: '1 acre', value: 1, unit: 'acre' },
    { label: '2 acres', value: 2, unit: 'acre' },
    { label: '5 acres', value: 5, unit: 'acre' },
    { label: '10 acres', value: 10, unit: 'acre' },
    { label: '25 acres', value: 25, unit: 'acre' },
  ],
};

// ─── Unit options per property type ─────────────────────────────────────────

interface UnitOption {
  value: string;
  label: string;
}

const UNIT_OPTIONS: Record<AreaPropertyType, UnitOption[]> = {
  land: [
    { value: 'cent', label: 'Cents' },
    { value: 'gunta', label: 'Guntas' },
    { value: 'sqft', label: 'Sq Ft' },
    { value: 'sqm', label: 'Sq M' },
  ],
  house: [
    { value: 'sqft', label: 'Sq Ft' },
    { value: 'sqm', label: 'Sq M' },
  ],
  apartment: [
    { value: 'sqft', label: 'Sq Ft' },
    { value: 'sqm', label: 'Sq M' },
  ],
  commercial: [
    { value: 'sqft', label: 'Sq Ft' },
    { value: 'sqm', label: 'Sq M' },
  ],
  agricultural_land: [
    { value: 'acre', label: 'Acres' },
    { value: 'cent', label: 'Cents' },
    { value: 'gunta', label: 'Guntas' },
    { value: 'sqft', label: 'Sq Ft' },
    { value: 'sqm', label: 'Sq M' },
  ],
};

const DEFAULT_UNIT: Record<AreaPropertyType, string> = {
  land: 'cent',
  house: 'sqft',
  apartment: 'sqft',
  commercial: 'sqft',
  agricultural_land: 'acre',
};

// ─── Conversion helpers ─────────────────────────────────────────────────────

// All conversions reference: 1 cent = 435.6 sqft, 1 gunta = 1089 sqft,
// 1 acre = 100 cents = 40 guntas = 43560 sqft, 1 sqm = 10.7639 sqft

function toSqft(value: number, unit: string): number {
  switch (unit) {
    case 'cent': return value * 435.6;
    case 'gunta': return value * 1089;
    case 'sqm': return value * 10.7639;
    case 'acre': return value * 43560;
    case 'sqft':
    default: return value;
  }
}

function formatIndian(n: number): string {
  return n.toLocaleString('en-IN');
}

function getConversionText(value: number, unit: string): string {
  if (value <= 0) return '';

  const sqft = toSqft(value, unit);
  const parts: string[] = [];

  switch (unit) {
    case 'cent': {
      parts.push(`= ${formatIndian(Math.round(sqft))} sqft`);
      if (value >= 100) {
        parts.push(`${(value / 100).toFixed(2)} acres`);
      } else {
        parts.push(`${(sqft / 43560).toFixed(3)} acres`);
      }
      break;
    }
    case 'gunta': {
      parts.push(`= ${formatIndian(Math.round(sqft))} sqft`);
      if (value >= 40) {
        const acres = Math.floor(value / 40);
        const remaining = value % 40;
        if (remaining > 0) {
          parts.push(`${acres} acre${acres > 1 ? 's' : ''} ${remaining} guntas`);
        } else {
          parts.push(`${acres} acre${acres > 1 ? 's' : ''}`);
        }
      } else {
        parts.push(`${(sqft / 43560).toFixed(3)} acres`);
      }
      break;
    }
    case 'sqft': {
      parts.push(`= ${(sqft / 10.7639).toFixed(1)} sqm`);
      if (sqft >= 435.6) {
        parts.push(`${(sqft / 435.6).toFixed(2)} cents`);
      } else {
        parts.push(`${(sqft / 43560).toFixed(4)} acres`);
      }
      break;
    }
    case 'acre': {
      parts.push(`= ${formatIndian(Math.round(sqft))} sqft`);
      if (value >= 1) {
        parts.push(`${(value * 100).toFixed(0)} cents`);
      }
      break;
    }
    case 'sqm': {
      parts.push(`= ${formatIndian(Math.round(sqft))} sqft`);
      parts.push(`${(sqft / 435.6).toFixed(2)} cents`);
      break;
    }
    default: {
      parts.push(`= ${formatIndian(Math.round(sqft))} sqft`);
      break;
    }
  }

  return parts.join(' | ');
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AreaField({
  id,
  label,
  propertyType,
  initialArea,
  initialUnit,
  onChange,
  required = true,
}: AreaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const conversionId = `${fieldId}-conversions`;

  const defaultUnit = initialUnit ?? DEFAULT_UNIT[propertyType];
  const defaultLabel = (propertyType === 'land' || propertyType === 'agricultural_land') ? 'Land Area' : 'Built Area';

  const [text, setText] = useState(initialArea != null ? String(initialArea) : '');
  const [unit, setUnit] = useState(defaultUnit);

  // Sync when initialArea/initialUnit change externally (e.g. listing load)
  useEffect(() => {
    if (initialArea != null) {
      setText(String(initialArea));
    }
  }, [initialArea]);

  useEffect(() => {
    if (initialUnit != null) {
      setUnit(initialUnit);
    }
  }, [initialUnit]);

  const chips = AREA_CHIPS[propertyType];
  const unitOptions = UNIT_OPTIONS[propertyType];
  const parsedValue = text.trim() !== '' ? parseFloat(text) : null;
  const validValue = parsedValue != null && !isNaN(parsedValue) && parsedValue > 0 ? parsedValue : null;

  // Find matching chip (exact value + unit match)
  const activeChipIndex = chips.findIndex(
    (chip) => validValue != null && chip.value === validValue && chip.unit === unit,
  );

  const conversionText =
    validValue != null
      ? getConversionText(validValue, unit)
      : '';

  const handleTextChange = (raw: string) => {
    setText(raw);
    const num = raw.trim() !== '' ? parseFloat(raw) : null;
    const emitValue = num != null && !isNaN(num) && num > 0 ? num : null;
    onChange(emitValue, unit);
  };

  const handleUnitChange = (newUnit: string) => {
    setUnit(newUnit);
    const emitValue = validValue;
    onChange(emitValue, newUnit);
  };

  const handleChipClick = (chip: AreaChip) => {
    setText(String(chip.value));
    setUnit(chip.unit);
    onChange(chip.value, chip.unit);
  };

  return (
    <div className="space-y-3">
      <Label htmlFor={fieldId}>
        {label ?? defaultLabel}
        {required && ' *'}
      </Label>

      {/* Quick-pick chips */}
      <div
        role="radiogroup"
        aria-label="Common area sizes"
        className="flex flex-wrap gap-2"
      >
        {chips.map((chip, idx) => (
          <button
            key={chip.label}
            type="button"
            role="radio"
            aria-checked={idx === activeChipIndex}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              idx === activeChipIndex
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input bg-background hover:bg-secondary/50 text-foreground'
            }`}
            onClick={() => handleChipClick(chip)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Area input + unit select */}
      <div className="flex gap-2">
        <Input
          id={fieldId}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="Enter area"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          aria-describedby={conversionId}
          className="flex-1"
        />
        <Select value={unit} onValueChange={handleUnitChange}>
          <SelectTrigger className="w-28" aria-label="Area unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unitOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Conversion helper */}
      <p
        id={conversionId}
        className="text-xs text-muted-foreground min-h-[1.25rem]"
      >
        {conversionText || 'Enter area to see conversions'}
      </p>
    </div>
  );
}
