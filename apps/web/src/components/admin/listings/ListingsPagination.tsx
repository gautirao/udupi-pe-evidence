import { Button } from '@/components/ui/button';

interface ListingsPaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  updateParams: (patch: Record<string, string | null>) => void;
}

export function ListingsPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  updateParams,
}: ListingsPaginationProps) {
  if (totalCount === 0) return null;

  return (
    <div className="flex items-center justify-between border-t pt-4 mt-4 text-sm text-muted-foreground">
      <span>
        Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} of{' '}
        {totalCount} total
      </span>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={currentPage <= 1}
          onClick={() => updateParams({ page: String(currentPage - 1) })}
        >
          Previous
        </Button>
        <span className="tabular-nums">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={currentPage >= totalPages}
          onClick={() => updateParams({ page: String(currentPage + 1) })}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
