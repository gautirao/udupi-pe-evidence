import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parsePriceInput } from '@/lib/parsePriceInput';
import { formatPrice } from '@/lib/formatters';

interface PriceFieldProps {
  id?: string;
  label?: string;
  initialRupees?: number | null;
  onChange: (rupees: number | null) => void;
  required?: boolean;
}

export function PriceField({
  id = 'price',
  label = 'Price (INR)',
  initialRupees,
  onChange,
  required,
}: PriceFieldProps) {
  const [text, setText] = useState(
    initialRupees != null ? String(initialRupees) : '',
  );

  // When initialRupees changes externally (e.g. listing load), sync the display text
  useEffect(() => {
    if (initialRupees != null) {
      setText(String(initialRupees));
    }
  }, [initialRupees]);

  const parsed = parsePriceInput(text);
  const isInvalid = text.trim() !== '' && parsed === null;
  const preview = parsed != null ? formatPrice(parsed) : null;

  const handleChange = (value: string) => {
    setText(value);
    onChange(parsePriceInput(value));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && ' *'}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="e.g. 50 lakh, 1.2 crore, 75000"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
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
            : 'Enter price in rupees or use "50 lakh", "1.2 crore"'}
      </p>
    </div>
  );
}
