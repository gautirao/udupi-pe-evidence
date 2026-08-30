import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CITY_CONFIG } from '@/lib/localityUtils';

interface CityChipProps {
  city: string;
  onRemove?: () => void;
  className?: string;
}

export function CityChip({ city, onRemove, className }: CityChipProps) {
  const config = CITY_CONFIG[city];
  if (!config) return null;
  return (
    <Badge variant="secondary" className={`gap-1 text-sm pr-1 ${className ?? ''}`}>
      {config.label}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${config.label}`}
          onClick={onRemove}
          className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
