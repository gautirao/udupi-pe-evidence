import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import type { AreaOverviewResponse } from '@/hooks/useAreaOverview';

interface FallbackNoticeProps {
  fallback: AreaOverviewResponse['fallback'];
}

export function FallbackNotice({ fallback }: FallbackNoticeProps) {
  if (!fallback) {
    return null;
  }

  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>
        This area is new on our platform. Showing price overview for {fallback.districtLabel}{' '}
        district.
      </AlertDescription>
    </Alert>
  );
}
