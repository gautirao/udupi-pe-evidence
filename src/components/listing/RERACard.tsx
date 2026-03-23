import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface RERACardProps {
  reraNumber?: string | null;
  reraValid?: boolean;
  possessionStatus?: string | null;
  expectedPossessionDate?: string | null;
  approvalsDeclared?: string | null;
}

const POSSESSION_STATUS_LABELS: Record<string, string> = {
  ready_to_move: 'Ready to Move',
  under_construction: 'Under Construction',
  upcoming: 'Upcoming',
};

interface ApprovalsShape {
  building_plan?: boolean;
  occupancy_certificate?: boolean;
  local_authority_approval?: boolean;
}

function parseApprovals(raw: string | null | undefined): ApprovalsShape | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as ApprovalsShape;
    }
    return null;
  } catch {
    return null;
  }
}

function formatPossessionDate(isoDate: string): string {
  try {
    return format(parseISO(isoDate), 'MMMM yyyy');
  } catch {
    return isoDate;
  }
}

export function RERACard({
  reraNumber,
  reraValid,
  possessionStatus,
  expectedPossessionDate,
  approvalsDeclared,
}: RERACardProps) {
  const hasReraNumber = reraNumber != null && reraNumber !== '';
  const hasPossessionStatus = possessionStatus != null;
  const hasApprovals = approvalsDeclared != null;

  // Return nothing if there is no RERA / possession / approvals data at all
  if (!hasReraNumber && !hasPossessionStatus && !hasApprovals) {
    return null;
  }

  const approvals = parseApprovals(approvalsDeclared);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <h3 className="font-semibold text-sm">RERA &amp; Legal Readiness</h3>

        {/* RERA Section */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">RERA Registration</p>
          {hasReraNumber ? (
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href="https://rera.karnataka.gov.in"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
              >
                {reraNumber}
                <ExternalLink className="h-3 w-3" />
              </a>
              {reraValid ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs">Provided</Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">Format Unknown</Badge>
              )}
            </div>
          ) : (
            <Badge className="bg-gray-100 text-gray-600 border-0 text-xs">Not Provided</Badge>
          )}
        </div>

        {/* Possession Status */}
        {hasPossessionStatus && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Possession Status</p>
            <p className="text-sm font-medium">
              {POSSESSION_STATUS_LABELS[possessionStatus!] ?? possessionStatus}
            </p>
            {possessionStatus === 'under_construction' && expectedPossessionDate && (
              <p className="text-sm text-muted-foreground">
                Expected: {formatPossessionDate(expectedPossessionDate)}
              </p>
            )}
          </div>
        )}

        {/* Approvals Declared */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Approvals Declared</p>
          {approvals !== null ? (
            <ul className="space-y-1.5">
              {(
                [
                  { key: 'building_plan', label: 'Building Plan' },
                  { key: 'occupancy_certificate', label: 'Occupancy Certificate' },
                  { key: 'local_authority_approval', label: 'Local Authority Approval' },
                ] as { key: keyof ApprovalsShape; label: string }[]
              ).map(({ key, label }) => {
                const approved = approvals[key] === true;
                return (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <span
                      className={approved ? 'text-emerald-600 font-semibold' : 'text-gray-400 font-semibold'}
                      aria-label={approved ? 'Yes' : 'No'}
                    >
                      {approved ? '✓' : '✗'}
                    </span>
                    <span className={approved ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Not provided</p>
          )}
        </div>

        {/* Buyer Document Checklist — static, collapsed by default */}
        <Accordion type="single" collapsible>
          <AccordionItem value="checklist" className="border-0">
            <AccordionTrigger className="text-sm font-medium py-1 hover:no-underline">
              Buyer Document Checklist
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                <li>Sale Deed</li>
                <li>Encumbrance Certificate</li>
                <li>Khata</li>
                <li>Occupancy Certificate</li>
                <li>RERA Registration</li>
                <li>Builder Track Record</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
