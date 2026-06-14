import React from 'react';
import { Button } from '@/components/ui/button';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';

interface IntentSelectorProps {
  intent: DiscoverIntent;
  onIntentChange: (intent: DiscoverIntent) => void;
}

export function IntentSelector({ intent, onIntentChange }: IntentSelectorProps) {
  return (
    <div
      className="flex items-center gap-2"
      data-testid="intent-selector"
      role="group"
      aria-label="Looking to"
    >
      <span className="text-xs text-muted-foreground font-medium shrink-0">Looking to</span>
      <div className="flex rounded-md border border-border overflow-hidden">
        <Button
          variant={intent === 'buy' ? 'default' : 'ghost'}
          size="sm"
          className="rounded-none border-0 h-7 px-3 text-xs"
          aria-pressed={intent === 'buy'}
          data-testid="intent-selector-buy"
          onClick={() => onIntentChange('buy')}
        >
          Buy
        </Button>
        <div className="w-px bg-border" aria-hidden="true" />
        <Button
          variant={intent === 'rent' ? 'default' : 'ghost'}
          size="sm"
          className="rounded-none border-0 h-7 px-3 text-xs"
          aria-pressed={intent === 'rent'}
          data-testid="intent-selector-rent"
          onClick={() => onIntentChange('rent')}
        >
          Rent
        </Button>
      </div>
    </div>
  );
}
