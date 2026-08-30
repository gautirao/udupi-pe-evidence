interface ConfidenceBadgeProps {
  confidence: 'full' | 'limited' | 'fallback';
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (confidence === 'full') {
    return null;
  }

  if (confidence === 'limited') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        Limited data
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      Emerging area
    </span>
  );
}
