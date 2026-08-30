import React from 'react';
import { Map } from 'lucide-react';
import { PanelHeader } from '../PanelHeader';
import { EmptyState } from '@/components/ui/EmptyState';

interface AreaSelectionPanelProps {
  onStartOver: () => void;
}

export function AreaSelectionPanel({ onStartOver }: AreaSelectionPanelProps) {
  return (
    <>
      <PanelHeader
        title="Explore by neighbourhood"
        journey="area-first"
        onStartOver={onStartOver}
      />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-10 px-4">
        <EmptyState
          icon={<Map className="h-8 w-8 text-muted-foreground/40" />}
          heading="Choose a neighbourhood group"
          description="Coming soon — area-group cards"
        />
      </div>
    </>
  );
}
