import { ShieldCheck, Shield, FileCheck } from 'lucide-react';
import { TrustTier } from '../../types';

interface TrustBadgeProps {
  tier: TrustTier;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function TrustBadge({ tier, size = 'md', showLabel = true }: TrustBadgeProps) {
  const config = {
    verified: {
      icon: ShieldCheck,
      label: 'Verified',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      description: 'Documents verified, RERA registered',
    },
    trusted: {
      icon: Shield,
      label: 'Trusted',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      description: 'From verified broker',
    },
    standard: {
      icon: FileCheck,
      label: 'Listed',
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      description: 'Standard listing',
    },
  };

  const { icon: Icon, label, color, bg } = config[tier];
  const iconSize = size === 'sm' ? 14 : size === 'md' ? 16 : 20;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${bg}`}>
      <Icon size={iconSize} className={color} strokeWidth={2.5} />
      {showLabel && <span className={`text-xs font-medium ${color}`}>{label}</span>}
    </div>
  );
}

export function TrustBadgeDetail({ tier }: { tier: TrustTier }) {
  const config = {
    verified: {
      icon: ShieldCheck,
      label: 'Verified Property',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      items: [
        'Ownership documents verified',
        'RERA registration confirmed',
        'Broker credentials checked',
        'Property photos verified on-site',
      ],
    },
    trusted: {
      icon: Shield,
      label: 'Trusted Listing',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      items: [
        'Listed by verified broker',
        'Broker track record confirmed',
        'Property details cross-checked',
      ],
    },
    standard: {
      icon: FileCheck,
      label: 'Standard Listing',
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      items: [
        'Basic verification pending',
        'Listing under review',
      ],
    },
  };

  const { icon: Icon, label, color, bg, border, items } = config[tier];

  return (
    <div className={`p-4 rounded-lg border ${bg} ${border}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-white`}>
          <Icon size={24} className={color} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold mb-2 ${color}`}>{label}</h3>
          <ul className="space-y-1.5">
            {items.map((item, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                <span className={`mt-1 ${color}`}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
