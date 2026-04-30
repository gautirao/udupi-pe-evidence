import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SchoolSearchFilter } from '@/components/map/SchoolSearchFilter';
import { SchoolResult } from '@/hooks/useSchoolSearch';

export interface NearSchoolSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSchool: SchoolResult | null;
  onSchoolSelect: (school: SchoolResult | null) => void;
  radiusKm: number;
  onRadiusChange: (km: number) => void;
  boardFilter: string[];
  onBoardFilterChange: (boards: string[]) => void;
}

export function NearSchoolSheet({
  open,
  onOpenChange,
  selectedSchool,
  onSchoolSelect,
  radiusKm,
  onRadiusChange,
  boardFilter,
  onBoardFilterChange,
}: NearSchoolSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
          <SheetTitle className="text-base">Near a school</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <SchoolSearchFilter
            selectedSchool={selectedSchool}
            onSchoolSelect={onSchoolSelect}
            radiusKm={radiusKm}
            onRadiusChange={onRadiusChange}
            boardFilter={boardFilter}
            onBoardFilterChange={onBoardFilterChange}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
