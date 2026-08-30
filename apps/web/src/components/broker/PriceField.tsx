import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { parsePriceInput } from '@/lib/parsePriceInput';
import { formatPrice } from '@/lib/formatters';

// Log-scale constants
const LOG_MIN = Math.log10(1_000_000); // 6
const LOG_MAX = Math.log10(100_000_000); // 8
const SLIDER_STEPS = 1000;

// Rupees → slider position (0–1000)
function rupeesToSlider(rupees: number): number {
  const clamped = Math.max(1_000_000, Math.min(rupees, 100_000_000));
  return Math.round(
    ((Math.log10(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * SLIDER_STEPS,
  );
}

// Slider position → rupees (rounded to nearest 10k)
function sliderToRupees(pos: number): number {
  const logVal = LOG_MIN + (pos / SLIDER_STEPS) * (LOG_MAX - LOG_MIN);
  return Math.round(Math.pow(10, logVal) / 10_000) * 10_000;
}

// Rupees → human-readable text for slider output
function rupeesToText(rupees: number): string {
  if (rupees >= 10_000_000) {
    const cr = rupees / 10_000_000;
    return `${cr % 1 === 0 ? cr : cr.toFixed(2)} crore`;
  }
  const lakh = rupees / 100_000;
  return `${lakh % 1 === 0 ? lakh : lakh.toFixed(2)} lakh`;
}

interface PriceFieldProps {
  id?: string;
  label?: string;
  initialRupees?: number | null;
  onChange: (rupees: number | null) => void;
  required?: boolean;
  /**
   * #2348 — the Radix Slider below is not a form-associated element, so a
   * wrapping `<fieldset disabled>` (as used during CommercialListingForm's
   * draft-recovery window) never reaches it. Pass this through explicitly so
   * callers can disable the slider (and the text input) alongside the rest
   * of a recovering/disabled form.
   */
  disabled?: boolean;
}

export function PriceField({
  id = 'price',
  label = 'Price (INR)',
  initialRupees,
  onChange,
  required,
  disabled,
}: PriceFieldProps) {
  const [text, setText] = useState(
    initialRupees != null ? rupeesToText(initialRupees) : '',
  );
  const [sliderPos, setSliderPos] = useState(
    initialRupees != null ? rupeesToSlider(initialRupees) : 500,
  );

  // When initialRupees changes externally (e.g. listing load), sync both controls
  useEffect(() => {
    if (initialRupees != null) {
      setText(rupeesToText(initialRupees));
      setSliderPos(rupeesToSlider(initialRupees));
    }
  }, [initialRupees]);

  const parsed = parsePriceInput(text);
  const isInvalid = text.trim() !== '' && parsed === null;
  const preview = parsed != null ? formatPrice(parsed) : null;

  // Text input change → try to move slider
  const handleTextChange = (value: string) => {
    setText(value);
    const rupees = parsePriceInput(value);
    onChange(rupees);
    if (rupees != null && rupees >= 1_000_000 && rupees <= 100_000_000) {
      setSliderPos(rupeesToSlider(rupees));
    }
  };

  // Slider change → update text
  const handleSliderChange = (value: number[]) => {
    const pos = value[0];
    const rupees = sliderToRupees(pos);
    setSliderPos(pos);
    setText(rupeesToText(rupees));
    onChange(rupees);
  };

  return (
    <div className="space-y-3">
      <Label htmlFor={id}>
        {label}
        {required && ' *'}
      </Label>

      {/* Slider */}
      <div className="space-y-1">
        <Slider
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={[sliderPos]}
          onValueChange={handleSliderChange}
          aria-label="Price slider"
          disabled={disabled}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>₹10 L</span>
          <span>₹10 Cr</span>
        </div>
      </div>

      {/* Text input */}
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="e.g. 50 lakh, 1.2 crore, 75000"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        aria-describedby={`${id}-hint`}
        aria-invalid={isInvalid}
        className={isInvalid ? 'border-destructive' : ''}
      />
      <p
        id={`${id}-hint`}
        className="text-xs text-muted-foreground min-h-[1.25rem]"
      >
        {isInvalid
          ? 'Enter a number like "50 lakh", "1.2 crore", or "75000"'
          : preview
            ? `Preview: ${preview}`
            : 'Drag the slider or type a price'}
      </p>
    </div>
  );
}
