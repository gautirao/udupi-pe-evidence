import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2, ShieldCheck } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  listing_approved: 'bg-green-100 text-green-800',
  listing_rejected: 'bg-red-100 text-red-800',
  locality_renamed: 'bg-blue-100 text-blue-800',
};

function actionBadge(action: string) {
  const cls = ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

function formatTs(ts: string) {
  return new Date(ts).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function shortId(id: string | null) {
  if (!id) return '—';
  return id.slice(0, 8) + '…';
}

export default function AuditLog() {
  const { data: entries, isLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ['admin-audit-log'],
    queryFn: () => api.get<AuditLogEntry[]>('/api/admin/audit-log?limit=100'),
    staleTime: 30_000,
  });

  return (
    <AppLayout>
      <div className="container max-w-6xl py-8 px-4">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Admin Audit Log</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !entries || entries.length === 0 ? (
          <p className="text-muted-foreground">No audit entries yet.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatTs(e.createdAt)}
                    </TableCell>
                    <TableCell>{actionBadge(e.action)}</TableCell>
                    <TableCell className="text-xs">{e.entityType ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs" title={e.entityId ?? ''}>
                      {shortId(e.entityId)}
                    </TableCell>
                    <TableCell className="font-mono text-xs" title={e.adminId}>
                      {shortId(e.adminId)}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[160px] truncate" title={e.beforeJson ?? ''}>
                      {e.beforeJson ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[160px] truncate" title={e.afterJson ?? ''}>
                      {e.afterJson ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
