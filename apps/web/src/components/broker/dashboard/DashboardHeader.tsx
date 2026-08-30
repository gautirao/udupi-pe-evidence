import { Link } from 'react-router-dom';
import { List, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardHeaderProps {
  greeting: string;
  onExplainMetrics: () => void;
}

export function DashboardHeader({
  greeting,
  onExplainMetrics,
}: DashboardHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-primary">{greeting}</h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s your portfolio at a glance.{' '}
          <button
            type="button"
            className="underline text-sm text-muted-foreground hover:text-primary transition-colors"
            onClick={onExplainMetrics}
          >
            How are these calculated?
          </button>
        </p>
      </div>

      <div className="flex items-center gap-2 mt-3 sm:mt-0">
        <Button asChild size="sm">
          <Link to="/broker/listings/new">
            <PlusCircle className="h-4 w-4 mr-1.5" />
            New Listing
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/broker/listings">
            <List className="h-4 w-4 mr-1.5" />
            All Listings
          </Link>
        </Button>
      </div>
    </div>
  );
}
