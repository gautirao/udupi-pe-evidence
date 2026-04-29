import { ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const DIMENSION_LABELS: Record<string, string> = {
  IDENTITY: 'Identity Verified',
  LOCATION: 'Location Verified',
  PHOTOS: 'Photos Verified',
  AUTHORITY: 'Authority Verified',
  FIELD: 'Field Verified',
  DOCUMENTS: 'Documents Reviewed',
};

const DIMENSION_TOOLTIPS: Record<string, string> = {
  IDENTITY: 'The person marketing this property has verified their phone number with us.',
  LOCATION: 'The listing agent visited this property and confirmed its location within 200m.',
  PHOTOS: 'Photos of this property were captured on-site and checked for duplicates.',
  AUTHORITY: 'The agent has confirmed their authorisation to market this property.',
  FIELD: 'A field agent physically visited this property.',
  DOCUMENTS: 'Supporting documents for this property have been reviewed.',
};

const REALNESS_TYPES = new Set(['LOCATION', 'PHOTOS', 'FIELD']);
const AUTHORISATION_TYPES = new Set(['IDENTITY', 'AUTHORITY', 'DOCUMENTS']);

export interface TrustBadge {
  dimensionType: string;
  grantedAt: string;
}

interface BadgeChipProps {
  badge: TrustBadge;
}

function BadgeChip({ badge }: BadgeChipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 cursor-default"
          >
            {DIMENSION_LABELS[badge.dimensionType] ?? badge.dimensionType}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">
            {DIMENSION_TOOLTIPS[badge.dimensionType] ?? 'This aspect of the listing has been verified.'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface TrustBadgeCardProps {
  badges: TrustBadge[];
}

export function TrustBadgeCard({ badges }: TrustBadgeCardProps) {
  const realnessBadges = badges.filter((b) => REALNESS_TYPES.has(b.dimensionType));
  const authorisationBadges = badges.filter((b) => AUTHORISATION_TYPES.has(b.dimensionType));

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-green-600" aria-hidden="true" />
          Verified by Udupi Properties
        </h3>
        {realnessBadges.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Has this listing been verified to exist?</p>
            <div className="flex flex-wrap gap-2">
              {realnessBadges.map((badge) => (
                <BadgeChip key={badge.dimensionType} badge={badge} />
              ))}
            </div>
          </div>
        )}
        {authorisationBadges.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Has this person been verified as authorised to market it?</p>
            <div className="flex flex-wrap gap-2">
              {authorisationBadges.map((badge) => (
                <BadgeChip key={badge.dimensionType} badge={badge} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
