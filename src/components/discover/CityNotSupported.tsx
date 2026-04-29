import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';

interface CityNotSupportedProps {
  city: string;
}

export function CityNotSupported({ city }: CityNotSupportedProps) {
  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <h2 className="text-xl font-semibold mb-2">City not supported</h2>
          <p className="text-sm text-muted-foreground mb-6">
            We don&apos;t have data for &ldquo;<strong>{city}</strong>&rdquo; yet.
          </p>
          <Button asChild className="mb-3">
            <Link to={`/discover?city=${DEFAULT_CITY}`}>
              Explore {CITY_CONFIG[DEFAULT_CITY]?.label ?? DEFAULT_CITY}
            </Link>
          </Button>
          <div>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Go Home
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
