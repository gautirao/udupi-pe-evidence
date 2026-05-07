/**
 * School journey panel stubs — Milestone 2 (S1–S3).
 *
 * These components are intentional placeholders. Real school UI will be
 * implemented when S1 ships. They exist here so the DiscoverRightPanel
 * state machine can reference all panel states without compile errors.
 */
import React from 'react';
import { GraduationCap, SlidersHorizontal } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PanelHeader } from '../PanelHeader';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// ─── Shared placeholder ───────────────────────────────────────────────────────

interface Milestone2PlaceholderProps {
  title: string;
  journey?: DiscoverJourney | null;
  onStartOver?: () => void;
}

function Milestone2Placeholder({ title, journey, onStartOver }: Milestone2PlaceholderProps) {
  return (
    <>
      <PanelHeader title={title} journey={journey} onStartOver={onStartOver} />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-10 px-4">
        <EmptyState
          icon={<GraduationCap className="h-8 w-8 text-muted-foreground/40" />}
          heading="Coming in Milestone 2"
          description="School-journey features are not yet available"
        />
      </div>
    </>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** school-first journey — no area or school selected yet. */
export interface SchoolBrowsePanelProps {
  onStartOver?: () => void;
  journey?: DiscoverJourney | null;
}
export function SchoolBrowsePanel({ onStartOver, journey }: SchoolBrowsePanelProps) {
  return <Milestone2Placeholder title="Find a school" journey={journey} onStartOver={onStartOver} />;
}

/** school-first journey — area selected but no school selected yet. */
export interface SchoolsInAreaPanelProps {
  selectedArea: AreaPoint;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: DiscoverJourney | null;
}
export function SchoolsInAreaPanel({ onStartOver, journey }: SchoolsInAreaPanelProps) {
  return <Milestone2Placeholder title="Schools in area" journey={journey} onStartOver={onStartOver} />;
}

/** school-first journey — schoolId present. */
export interface SchoolSelectedPanelProps {
  schoolId: string;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: DiscoverJourney | null;
  filtersContent?: React.ReactNode;
  activeContextChips?: React.ReactNode;
}
export function SchoolSelectedPanel({ onStartOver, journey, filtersContent, activeContextChips }: SchoolSelectedPanelProps) {
  return (
    <>
      <PanelHeader
        title="School details"
        journey={journey}
        onStartOver={onStartOver}
        activeContextChips={activeContextChips}
        actions={
          filtersContent && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-7 w-7">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">Filters</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                {filtersContent}
              </SheetContent>
            </Sheet>
          )
        }
      />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-10 px-4">
        <EmptyState
          icon={<GraduationCap className="h-8 w-8 text-muted-foreground/40" />}
          heading="Coming in Milestone 2"
          description="School-journey features are not yet available"
        />
      </div>
    </>
  );
}

/** Both area and school are selected (cross-journey). */
export interface AreaSchoolCombinedPanelProps {
  selectedArea?: AreaPoint | null;
  schoolId?: string | null;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: DiscoverJourney | null;
}
export function AreaSchoolCombinedPanel({ onStartOver, journey }: AreaSchoolCombinedPanelProps) {
  return <Milestone2Placeholder title="Area + school view" journey={journey} onStartOver={onStartOver} />;
}
