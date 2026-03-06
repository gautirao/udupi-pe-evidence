import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  useLocalityCandidates,
  useLocalityPreview,
  useLocalityApply,
  LocalityCandidate,
} from '@/hooks/useLocalityNormalizer';
import { Loader2, MapPin, Filter, ArrowRight, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

type FilterMode = 'all' | 'needs_fix' | 'ok';

export default function LocalityNormalizer() {
  const { data: candidates = [], isLoading } = useLocalityCandidates();
  const preview = useLocalityPreview();
  const apply = useLocalityApply();

  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog state
  const [dialogCandidate, setDialogCandidate] = useState<LocalityCandidate | null>(null);
  const [customTo, setCustomTo] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const filteredCandidates = candidates.filter((c) => {
    if (filterMode === 'needs_fix' && !c.needsNormalization) return false;
    if (filterMode === 'ok' && c.needsNormalization) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return c.raw.toLowerCase().includes(q) || c.suggestedCanonical?.toLowerCase().includes(q);
    }
    return true;
  });

  const needsFixCount = candidates.filter((c) => c.needsNormalization).length;

  const openDialog = (candidate: LocalityCandidate, useCustom = false) => {
    setDialogCandidate(candidate);
    setCustomTo(useCustom ? '' : (candidate.suggestedCanonical ?? ''));
    setPreviewCount(null);
    setConfirmed(false);
  };

  const closeDialog = () => {
    setDialogCandidate(null);
    setCustomTo('');
    setPreviewCount(null);
    setConfirmed(false);
    preview.reset();
  };

  const handlePreview = async () => {
    if (!dialogCandidate) return;
    const result = await preview.mutateAsync({ from: dialogCandidate.raw, to: customTo });
    setPreviewCount(result.affectedCount);
    setConfirmed(false);
  };

  const handleApply = async () => {
    if (!dialogCandidate || !customTo.trim()) return;
    await apply.mutateAsync({ from: dialogCandidate.raw, to: customTo.trim() });
    closeDialog();
  };

  const toValue = customTo.trim();
  const canApply = toValue && toValue !== dialogCandidate?.raw && previewCount !== null;

  return (
    <AppLayout>
      <div className="container py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" />
              Locality Normalizer
            </h1>
            <p className="text-muted-foreground">Review and standardize locality names across listings</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{candidates.length}</div>
              <p className="text-sm text-muted-foreground">Distinct localities</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{needsFixCount}</div>
              <p className="text-sm text-muted-foreground">Need normalization</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{candidates.length - needsFixCount}</div>
              <p className="text-sm text-muted-foreground">Already normalized</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search localities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs"
              />
              <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All localities</SelectItem>
                  <SelectItem value="needs_fix">Needs fix only</SelectItem>
                  <SelectItem value="ok">Already OK</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-sm text-muted-foreground ml-auto">
                Showing {filteredCandidates.length} of {candidates.length}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw Locality</TableHead>
                  <TableHead>Suggested Canonical</TableHead>
                  <TableHead className="text-right">Listings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.map((candidate) => (
                  <TableRow key={candidate.raw} className={cn(candidate.needsNormalization && 'bg-yellow-50/40')}>
                    <TableCell className="font-mono text-sm">{candidate.raw}</TableCell>
                    <TableCell>
                      {candidate.needsNormalization ? (
                        <span className="font-medium text-primary">{candidate.suggestedCanonical}</span>
                      ) : (
                        <span className="text-muted-foreground">{candidate.suggestedCanonical}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">{candidate.listingCount}</TableCell>
                    <TableCell>
                      {candidate.needsNormalization ? (
                        <Badge className="bg-yellow-500/10 text-yellow-700">Needs fix</Badge>
                      ) : (
                        <Badge className="bg-green-500/10 text-green-600">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {candidate.needsNormalization && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(candidate)}
                            className="text-xs h-7 gap-1"
                          >
                            <ArrowRight className="h-3 w-3" />
                            Apply suggestion
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openDialog(candidate, true)}
                          title="Custom rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredCandidates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No localities match the current filter
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Rename Dialog */}
        <Dialog open={!!dialogCandidate} onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Locality</DialogTitle>
              <DialogDescription>
                Bulk-rename all listings with this locality. Preview the impact before applying.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From (current value)</Label>
                <div className="font-mono text-sm border rounded px-3 py-2 bg-muted">
                  {dialogCandidate?.raw}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="to-input">To (new value)</Label>
                <Input
                  id="to-input"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setPreviewCount(null);
                    setConfirmed(false);
                  }}
                  placeholder="e.g., Manipal"
                />
              </div>

              {previewCount !== null && (
                <div className={cn(
                  'rounded-lg px-4 py-3 text-sm',
                  previewCount > 0 ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-muted text-muted-foreground'
                )}>
                  {previewCount > 0
                    ? `This will update ${previewCount} listing${previewCount !== 1 ? 's' : ''}.`
                    : 'No listings found with this locality.'}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              {previewCount === null ? (
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  disabled={!toValue || preview.isPending}
                >
                  {preview.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Preview Impact
                </Button>
              ) : (
                <Button
                  onClick={handleApply}
                  disabled={!canApply || apply.isPending || previewCount === 0}
                  variant={previewCount > 0 ? 'default' : 'outline'}
                >
                  {apply.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Apply ({previewCount} listings)
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
