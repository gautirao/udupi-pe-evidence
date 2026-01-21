import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRawPosts, useAdminListings } from '@/hooks/useAdminData';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Home,
  Clock,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ProcessingResult {
  success: boolean;
  processed: number;
  listings_created: number;
  failed: number;
  message: string;
}

export default function ProcessPosts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: rawPosts = [], isLoading: loadingPosts, refetch: refetchPosts } = useRawPosts(undefined, 200);
  const { data: listings = [], isLoading: loadingListings, refetch: refetchListings } = useAdminListings(50);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProcessingResult | null>(null);

  const unprocessedPosts = rawPosts.filter((p) => !p.is_processed);
  const processedPosts = rawPosts.filter((p) => p.is_processed);
  const recentListings = listings.slice(0, 10);

  const handleProcess = async (batchSize = 10) => {
    if (unprocessedPosts.length === 0) {
      toast({ title: 'No posts to process', description: 'All posts have been processed.', variant: 'default' });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResult(null);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 5, 90));
      }, 500);

      const { data, error } = await supabase.functions.invoke('parse-posts', {
        body: { batch_size: batchSize },
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) {
        throw error;
      }

      setResult(data as ProcessingResult);
      
      toast({
        title: 'Processing Complete',
        description: data.message,
        variant: data.listings_created > 0 ? 'default' : 'default',
      });

      // Refresh data
      await Promise.all([refetchPosts(), refetchListings()]);
      queryClient.invalidateQueries({ queryKey: ['property-listings'] });

    } catch (err) {
      console.error('Processing error:', err);
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

  const handleRefresh = () => {
    refetchPosts();
    refetchListings();
  };

  return (
    <AppLayout>
      <div className="container py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Process Posts
            </h1>
            <p className="text-muted-foreground">AI-powered extraction of property listings</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loadingPosts}>
              <RefreshCw className={`h-4 w-4 ${loadingPosts ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold">{unprocessedPosts.length}</div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{processedPosts.length}</div>
                  <p className="text-sm text-muted-foreground">Processed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Home className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{listings.length}</div>
                  <p className="text-sm text-muted-foreground">Listings</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">
                    {listings.filter((l) => l.is_valid).length}
                  </div>
                  <p className="text-sm text-muted-foreground">Valid</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Processing Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Processing
                </CardTitle>
                <CardDescription>
                  Extract property details from unprocessed posts using AI
                </CardDescription>
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
                  <div className={`p-4 rounded-lg border ${
                    result.listings_created > 0 
                      ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' 
                      : 'bg-muted'
                  }`}>
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
                          {result.failed > 0 && (
                            <span className="text-red-600">Failed: {result.failed}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => handleProcess(10)}
                    disabled={isProcessing || unprocessedPosts.length === 0}
                    className="flex-1"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Process 10 Posts
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleProcess(50)}
                    disabled={isProcessing || unprocessedPosts.length === 0}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Process 50
                  </Button>
                </div>

                {unprocessedPosts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    ✓ All posts have been processed
                  </p>
                )}
              </CardContent>
            </Card>

            {/* How it works */}
            <Card className="bg-accent/30 border-accent">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">How AI Processing Works</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>1. AI analyzes each post to detect real estate listings</p>
                <p>2. Non-real-estate posts (discussions, furniture, etc.) are filtered out</p>
                <p>3. Property details are extracted: price, type, locality, bedrooms, contact</p>
                <p>4. Listings with 70%+ confidence are marked as valid</p>
                <p>5. Lower confidence listings need manual review</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Listings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5" />
                Recent Listings
              </CardTitle>
              <CardDescription>
                Latest property listings extracted by AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingListings ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : recentListings.length === 0 ? (
                <div className="text-center py-8">
                  <Home className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No listings yet</p>
                  <p className="text-sm text-muted-foreground">Process some posts to create listings</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-3">
                    {recentListings.map((listing) => (
                      <div
                        key={listing.id}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">
                              {listing.property_type}
                            </Badge>
                            {listing.is_valid ? (
                              <Badge className="bg-green-500/10 text-green-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Valid
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-500/10 text-yellow-600">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Review
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {listing.confidence_score}%
                          </span>
                        </div>
                        <div className="space-y-1">
                          {listing.locality && (
                            <p className="text-sm font-medium">{listing.locality}</p>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {listing.price && (
                              <span>₹{(listing.price / 100000).toFixed(1)}L</span>
                            )}
                            {listing.bedrooms && <span>{listing.bedrooms} BHK</span>}
                            {listing.land_area && (
                              <span>{listing.land_area} {listing.land_area_unit || 'sqft'}</span>
                            )}
                          </div>
                          {listing.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {listing.description}
                            </p>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(listing.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
