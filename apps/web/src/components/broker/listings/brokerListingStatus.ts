export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Under Review',
  LIVE: 'Live',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

export function statusClassName(status: string): string {
  switch (status) {
    case 'LIVE':
      return 'bg-green-100 text-green-800 border-0';
    case 'PENDING_REVIEW':
      return 'bg-amber-100 text-amber-800 border-0';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 border-0';
    case 'DRAFT':
      return 'bg-gray-100 text-gray-600 border-0';
    case 'ARCHIVED':
      return 'bg-slate-100 text-slate-700 border-0';
    default:
      return 'bg-gray-100 text-gray-600 border-0';
  }
}
