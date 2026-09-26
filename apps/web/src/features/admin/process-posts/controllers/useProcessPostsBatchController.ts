import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { RawPost } from '@/hooks/useAdminData';
import type { useDebugLogs } from '@/components/admin/DebugConsole';

export interface FailedPost {
  id: string;
  reason: string;
  content_preview: string;
}

export interface ProcessingResult {
  success: boolean;
  processed: number;
  listings_created: number;
  failed: number;
  failed_posts?: FailedPost[];
  message: string;
}

export interface UseProcessPostsBatchControllerParams {
  unprocessedPosts: RawPost[];
  refetchPosts: () => unknown;
  refetchListings: () => unknown;
  debug: ReturnType<typeof useDebugLogs>;
  expandConsole: () => void;
}

/**
 * Issue #2662 — owns the batch-processing lifecycle: `isProcessing`,
 * `progress`, `result`, and `process(batchSize)`.
 *
 * `process()` is `handleProcess` from ProcessPosts.tsx moved VERBATIM
 * (statement-for-statement — only the enclosing function signature and
 * variable sourcing changed). This is deliberate: it is the SSE reader loop,
 * and re-deriving it risks silently changing parsing/progress/completion
 * behavior. Do not extract a callback helper or memoize this with
 * `useCallback`/`useMemo` — it closes over `unprocessedPosts` from the data
 * controller each render, and memoizing risks a stale closure over that
 * array.
 */
export function useProcessPostsBatchController({
  unprocessedPosts,
  refetchPosts,
  refetchListings,
  debug,
  expandConsole,
}: UseProcessPostsBatchControllerParams) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProcessingResult | null>(null);

  const process = async (batchSize = 10) => {
    if (unprocessedPosts.length === 0) {
      toast({ title: 'No posts to process', description: 'All posts have been processed.', variant: 'default' });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResult(null);
    expandConsole(); // Expand console for live logs

    debug.info(`Starting AI processing batch`, `Batch size: ${batchSize}, Pending posts: ${unprocessedPosts.length}`);

    try {
      const startTime = Date.now();

      // Use streaming mode for real-time logs
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-posts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ batch_size: batchSize, stream: true }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let processed = 0;
      let totalPosts = unprocessedPosts.length;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'done') {
                // Final summary
                const duration = Date.now() - startTime;
                setResult({
                  success: true,
                  processed: data.processed,
                  listings_created: data.listings_created,
                  failed: data.failed,
                  failed_posts: data.failed_posts,
                  message: `Processed ${data.processed} posts, created ${data.listings_created} listings (${data.geocoded} geocoded)`,
                });
                debug.success(`Batch complete in ${duration}ms`);
              } else if (data.type && data.message) {
                // Log event from edge function
                debug.addLog(data.type, data.message, data.details);

                // Update progress based on processing messages
                if (data.message.includes('Processing post')) {
                  const match = data.message.match(/(\d+)\/(\d+)/);
                  if (match) {
                    processed = parseInt(match[1]);
                    totalPosts = parseInt(match[2]);
                    setProgress(Math.round((processed / totalPosts) * 100));
                  }
                }
              }
            } catch (e) {
              // Skip malformed JSON
              console.warn('Failed to parse SSE event:', line);
            }
          }
        }
      }

      setProgress(100);

      toast({
        title: 'Processing Complete',
        description: `Batch processed successfully`,
      });

      // Refresh data
      debug.info('Refreshing data...');
      await Promise.all([refetchPosts(), refetchListings()]);
      queryClient.invalidateQueries({ queryKey: ['property-listings'] });
      debug.success('Data refreshed');

    } catch (err) {
      console.error('Processing error:', err);
      debug.error('Processing failed', err instanceof Error ? err.message : 'Unknown error');
      toast({
        title: 'Processing Failed',
        description: err instanceof Error ? err.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  return {
    isProcessing,
    progress,
    result,
    process,
  };
}

export type ProcessPostsBatchController = ReturnType<typeof useProcessPostsBatchController>;
