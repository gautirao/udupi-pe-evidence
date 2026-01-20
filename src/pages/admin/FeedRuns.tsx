import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFeedRuns, useFacebookGroups, useCreateFeedRun, FeedRun } from '@/hooks/useAdminData';
import {
  FileText,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

const statusConfig: Record<FeedRun['status'], { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock className="h-4 w-4" />, color: 'bg-muted text-muted-foreground', label: 'Pending' },
  running: { icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'bg-blue-500/10 text-blue-600', label: 'Running' },
  success: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'bg-green-500/10 text-green-600', label: 'Success' },
  partial: { icon: <AlertCircle className="h-4 w-4" />, color: 'bg-yellow-500/10 text-yellow-600', label: 'Partial' },
  failed: { icon: <XCircle className="h-4 w-4" />, color: 'bg-red-500/10 text-red-600', label: 'Failed' },
};

export default function FeedRuns() {
  const { data: feedRuns = [], isLoading, refetch } = useFeedRuns();
  const { data: groups = [] } = useFacebookGroups();
  const createFeedRun = useCreateFeedRun();
  
  const [selectedRun, setSelectedRun] = useState<FeedRun | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  const handleCreateRun = async () => {
    await createFeedRun.mutateAsync(selectedGroup || undefined);
    setSelectedGroup('');
  };

  // Stats
  const stats = {
    total: feedRuns.length,
    success: feedRuns.filter((r) => r.status === 'success').length,
    failed: feedRuns.filter((r) => r.status === 'failed').length,
    totalParsed: feedRuns.reduce((sum, r) => sum + (r.posts_parsed || 0), 0),
  };

  return (
    <AppLayout>
      <div className="container py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Feed Runs
            </h1>
            <p className="text-muted-foreground">Monitor ingestion jobs</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All groups</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCreateRun} disabled={createFeedRun.isPending}>
              {createFeedRun.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Run
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-sm text-muted-foreground">Total Runs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{stats.success}</div>
              <p className="text-sm text-muted-foreground">Successful</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <p className="text-sm text-muted-foreground">Failed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">{stats.totalParsed}</div>
              <p className="text-sm text-muted-foreground">Posts Parsed</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : feedRuns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No feed runs yet</p>
              <p className="text-muted-foreground mb-4">Start a feed run to begin ingesting posts</p>
              <Button onClick={handleCreateRun}>
                <Play className="h-4 w-4 mr-2" />
                Start First Run
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Fetched</TableHead>
                  <TableHead>Parsed</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedRuns.map((run) => {
                  const status = statusConfig[run.status];
                  const duration = run.started_at && run.ended_at
                    ? Math.round((new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                    : null;

                  return (
                    <TableRow key={run.id} className="cursor-pointer" onClick={() => setSelectedRun(run)}>
                      <TableCell>
                        <Badge className={status.color}>
                          {status.icon}
                          <span className="ml-1">{status.label}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {run.facebook_groups?.name || 'Manual Input'}
                      </TableCell>
                      <TableCell>{run.posts_fetched}</TableCell>
                      <TableCell className="text-green-600">{run.posts_parsed}</TableCell>
                      <TableCell className="text-red-600">{run.posts_failed}</TableCell>
                      <TableCell>
                        {duration !== null ? `${duration}s` : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {run.started_at
                          ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true })
                          : format(new Date(run.created_at), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Run Details Dialog */}
        <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Feed Run Details</DialogTitle>
              <DialogDescription>
                {selectedRun?.facebook_groups?.name || 'Manual Input'} •{' '}
                {selectedRun?.created_at && format(new Date(selectedRun.created_at), 'MMM d, yyyy HH:mm')}
              </DialogDescription>
            </DialogHeader>

            {selectedRun && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-xl font-bold">{selectedRun.posts_fetched}</div>
                      <p className="text-sm text-muted-foreground">Fetched</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-xl font-bold text-green-600">{selectedRun.posts_parsed}</div>
                      <p className="text-sm text-muted-foreground">Parsed</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-xl font-bold text-red-600">{selectedRun.posts_failed}</div>
                      <p className="text-sm text-muted-foreground">Failed</p>
                    </CardContent>
                  </Card>
                </div>

                {selectedRun.error_log && selectedRun.error_log.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      Error Log
                    </h4>
                    <ScrollArea className="h-48 rounded-md border bg-muted/50 p-3">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {JSON.stringify(selectedRun.error_log, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}