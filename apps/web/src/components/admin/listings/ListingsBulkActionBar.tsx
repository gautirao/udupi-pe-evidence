import { Button } from '@/components/ui/button';
import type { AdminListingRow } from '@/hooks/useAdminData';

interface ListingsBulkActionBarProps {
  selectedListings: Map<string, AdminListingRow>;
  onExportCsv: (listings: AdminListingRow[]) => void;
  onClearSelection: () => void;
}

export function ListingsBulkActionBar({
  selectedListings,
  onExportCsv,
  onClearSelection,
}: ListingsBulkActionBarProps) {
  if (selectedListings.size === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2 mb-3">
      <span className="text-sm font-medium">{selectedListings.size} selected</span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onExportCsv(Array.from(selectedListings.values()))}
        >
          Export selected (CSV)
        </Button>
        <Button size="sm" variant="ghost" onClick={onClearSelection}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}
