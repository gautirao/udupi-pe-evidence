import React from 'react';
import { PanelHeader } from '../PanelHeader';
import { JourneySwitcher } from '../JourneySwitcher';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

interface GuidedEntryPanelProps {
  onSelectJourney: (journey: DiscoverJourney) => void;
}

export function GuidedEntryPanel({ onSelectJourney }: GuidedEntryPanelProps) {
  return (
    <>
      <PanelHeader title="Find properties your way" />
      <div className="flex-1 overflow-y-auto">
        <JourneySwitcher onSelectJourney={onSelectJourney} />
      </div>
    </>
  );
}
