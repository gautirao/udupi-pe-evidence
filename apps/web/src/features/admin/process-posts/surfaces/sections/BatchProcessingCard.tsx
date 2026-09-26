import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Loader2, Play, CheckCircle2, XCircle, AlertCircle, Zap } from 'lucide-react';
import type { ProcessPostsBatchView, ProcessPostsBatchCommands } from '../processPostsSurfaceContract';

export interface BatchProcessingCardProps {
  view: ProcessPostsBatchView;
  commands: ProcessPostsBatchCommands;
}

/** Issue #2662 — moved verbatim from ProcessPosts.tsx's "AI Processing" card. */
export function BatchProcessingCard({ view, commands }: BatchProcessingCardProps) {
  const { isProcessing, progress, result, hasUnprocessed } = view;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Processing
        </CardTitle>
        <CardDescription>Extract property details from unprocessed posts using AI</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Processing posts...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {result && !isProcessing && (
          <div
            className={`p-4 rounded-lg border ${
              result.listings_created > 0
                ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                : 'bg-muted'
            }`}
          >
            <div className="flex items-start gap-3">
              {result.listings_created > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              )}
              <div>
                <p className="font-medium">{result.message}</p>
                <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                  <span>Processed: {result.processed}</span>
                  <span className="text-green-600">Created: {result.listings_created}</span>
                  {result.failed > 0 && <span className="text-red-600">Failed: {result.failed}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Failed Posts from last run */}
        {result?.failed_posts && result.failed_posts.length > 0 && (
          <div className="border border-red-200 dark:border-red-800 rounded-lg p-3 bg-red-50 dark:bg-red-950">
            <h4 className="font-medium text-red-700 dark:text-red-300 flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4" />
              Failed Posts ({result.failed_posts.length})
            </h4>
            <ScrollArea className="h-[150px]">
              <div className="space-y-2">
                {result.failed_posts.map((fp) => (
                  <div key={fp.id} className="text-sm p-2 bg-background rounded border">
                    <p className="text-muted-foreground truncate">{fp.content_preview}...</p>
                    <p className="text-red-600 text-xs mt-1">{fp.reason}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => commands.process(10)} disabled={isProcessing || !hasUnprocessed} className="flex-1">
            {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Process 10 Posts
          </Button>
          <Button
            variant="secondary"
            onClick={() => commands.process(50)}
            disabled={isProcessing || !hasUnprocessed}
          >
            <Zap className="h-4 w-4 mr-2" />
            Process 50
          </Button>
        </div>

        {!hasUnprocessed && (
          <p className="text-sm text-muted-foreground text-center py-4">✓ All posts have been processed</p>
        )}
      </CardContent>
    </Card>
  );
}
