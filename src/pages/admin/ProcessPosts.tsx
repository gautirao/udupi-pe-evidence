import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRawPosts, useAdminListings, useUpdateRawPost, useResetPostForReprocessing, RawPost } from '@/hooks/useAdminData';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { DebugConsole, useDebugLogs } from '@/components/admin/DebugConsole';
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
  Edit,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface FailedPost {
  id: string;
  reason: string;
  content_preview: string;
}

interface ProcessingResult {
  success: boolean;
  processed: number;
  listings_created: number;
  failed: number;
  failed_posts?: FailedPost[];
  message: string;
}

export default function ProcessPosts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const debug = useDebugLogs();
  
  const { data: rawPosts = [], isLoading: loadingPosts, refetch: refetchPosts } = useRawPosts(undefined, 200);
  const { data: listings = [], isLoading: loadingListings, refetch: refetchListings } = useAdminListings(50);
  const updateRawPost = useUpdateRawPost();
  const resetPostForReprocessing = useResetPostForReprocessing();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [editingPost, setEditingPost] = useState<RawPost | null>(null);
  const [editContent, setEditContent] = useState('');
  const [viewingPost, setViewingPost] = useState<RawPost | null>(null);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);

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

    debug.info(`Starting AI processing batch`, `Batch size: ${batchSize}, Pending posts: ${unprocessedPosts.length}`);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 5, 90));
      }, 500);

      debug.ai('Invoking parse-posts edge function...');
      const startTime = Date.now();

      const { data, error } = await supabase.functions.invoke('parse-posts', {
        body: { batch_size: batchSize },
      });

      const duration = Date.now() - startTime;
      clearInterval(progressInterval);
      setProgress(100);

      if (error) {
        debug.error('Edge function error', error.message);
        throw error;
      }

      const result = data as ProcessingResult & { geocoded?: number };
      setResult(result);

      debug.success(`Processing complete in ${duration}ms`);
      debug.info(`Posts processed: ${result.processed}`);
      
      if (result.listings_created > 0) {
        debug.success(`Listings created: ${result.listings_created}`);
      }
      
      if (result.geocoded && result.geocoded > 0) {
        debug.ai(`Geocoded: ${result.geocoded} localities`);
      }
      
      if (result.failed > 0) {
        debug.warning(`Failed: ${result.failed} posts`);
        result.failed_posts?.forEach((fp) => {
          debug.error(`Post ${fp.id.substring(0, 8)}...`, fp.reason);
        });
      }

      toast({
        title: 'Processing Complete',
        description: result.message,
        variant: result.listings_created > 0 ? 'default' : 'default',
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

  const handleRefresh = () => {
    refetchPosts();
    refetchListings();
  };

  const handleEditPost = (post: RawPost) => {
    setEditingPost(post);
    setEditContent(post.content);
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;
    
    await updateRawPost.mutateAsync({
      id: editingPost.id,
      updates: { content: editContent, is_processed: false }
    });
    
    setEditingPost(null);
    setEditContent('');
    refetchPosts();
  };

  const handleResetPost = async (postId: string) => {
    await resetPostForReprocessing.mutateAsync(postId);
    refetchPosts();
  };

  const handleViewPost = (post: RawPost) => {
    setViewingPost(post);
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

            {/* Debug Console */}
            <DebugConsole
              logs={debug.logs}
              onClear={debug.clearLogs}
              isCollapsed={consoleCollapsed}
              onToggleCollapse={() => setConsoleCollapsed(!consoleCollapsed)}
            />

            {/* Raw Posts Browser */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Raw Posts
                </CardTitle>
                <CardDescription>
                  View and edit raw posts before processing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="pending" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="pending">
                      Pending ({unprocessedPosts.length})
                    </TabsTrigger>
                    <TabsTrigger value="processed">
                      Processed ({processedPosts.length})
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="pending">
                    <ScrollArea className="h-[300px] pr-4">
                      {unprocessedPosts.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No pending posts</p>
                      ) : (
                        <div className="space-y-2">
                          {unprocessedPosts.slice(0, 20).map((post) => (
                            <div key={post.id} className="p-3 rounded-lg border bg-card">
                              <p className="text-sm line-clamp-2 mb-2">{post.content}</p>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                                </span>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => handleViewPost(post)}>
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleEditPost(post)}>
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                  
                  <TabsContent value="processed">
                    <ScrollArea className="h-[300px] pr-4">
                      {processedPosts.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No processed posts</p>
                      ) : (
                        <div className="space-y-2">
                          {processedPosts.slice(0, 20).map((post) => (
                            <div key={post.id} className="p-3 rounded-lg border bg-card">
                              <p className="text-sm line-clamp-2 mb-2">{post.content}</p>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                                </span>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => handleViewPost(post)}>
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => handleResetPost(post.id)}
                                    title="Reset for reprocessing"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
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
                <ScrollArea className="h-[600px] pr-4">
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

      {/* Edit Post Dialog */}
      <Dialog open={!!editingPost} onOpenChange={() => setEditingPost(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Raw Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
              placeholder="Post content..."
            />
            <p className="text-sm text-muted-foreground">
              Edit the content and save to mark for reprocessing.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPost(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateRawPost.isPending}>
              {updateRawPost.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save & Reprocess
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Post Dialog */}
      <Dialog open={!!viewingPost} onOpenChange={() => setViewingPost(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>View Raw Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <pre className="whitespace-pre-wrap text-sm">{viewingPost?.content}</pre>
            </div>
            {viewingPost?.images && viewingPost.images.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Images ({viewingPost.images.length})</h4>
                <div className="grid grid-cols-3 gap-2">
                  {viewingPost.images.slice(0, 6).map((img, idx) => (
                    <a 
                      key={idx} 
                      href={img.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="aspect-square bg-muted rounded overflow-hidden"
                    >
                      <img 
                        src={img.url} 
                        alt={img.alt || `Image ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder.svg';
                        }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-4 text-sm text-muted-foreground">
              {viewingPost?.author_name && <span>Author: {viewingPost.author_name}</span>}
              {viewingPost?.posted_at && (
                <span>Posted: {new Date(viewingPost.posted_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingPost(null)}>
              Close
            </Button>
            <Button onClick={() => {
              if (viewingPost) {
                handleEditPost(viewingPost);
                setViewingPost(null);
              }
            }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}