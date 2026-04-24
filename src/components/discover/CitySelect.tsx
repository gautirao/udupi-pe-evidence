import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CITY_CONFIG } from '@/lib/localityUtils';

interface CitySelectProps {
  value: string;
  onChange: (city: string) => void;
  className?: string;
}

export function CitySelect({ value, onChange, className }: CitySelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select city" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(CITY_CONFIG).map(([key, config]) => (
          <SelectItem key={key} value={key}>
            {config.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
