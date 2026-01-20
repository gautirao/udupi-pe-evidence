import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCreateRawPost, useRawPosts, useCreateFeedRun } from '@/hooks/useAdminData';
import { 
  PenLine, 
  Loader2, 
  Send, 
  FileText, 
  Clock, 
  CheckCircle2,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function ManualPost() {
  const createRawPost = useCreateRawPost();
  const createFeedRun = useCreateFeedRun();
  const { data: recentPosts = [], isLoading } = useRawPosts(undefined, 20);

  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [bulkContent, setBulkContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSingleSubmit = async () => {
    if (!content.trim()) return;
    
    setIsSubmitting(true);
    try {
      // Create a feed run for manual posts
      const feedRun = await createFeedRun.mutateAsync(undefined);
      
      // Create the raw post
      await createRawPost.mutateAsync({
        content: content.trim(),
        author_name: authorName.trim() || undefined,
        feed_run_id: feedRun.id,
        posted_at: new Date().toISOString(),
      });
      
      setContent('');
      setAuthorName('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (!bulkContent.trim()) return;
    
    setIsSubmitting(true);
    try {
      // Split by double newlines to separate posts
      const posts = bulkContent
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      
      if (posts.length === 0) return;

      // Create a feed run for bulk posts
      const feedRun = await createFeedRun.mutateAsync(undefined);
      
      // Create all posts
      for (const postContent of posts) {
        await createRawPost.mutateAsync({
          content: postContent,
          feed_run_id: feedRun.id,
          posted_at: new Date().toISOString(),
        });
      }
      
      setBulkContent('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const examplePost = `🏠 For Sale - 3BHK House in Manipal
Near MIT, 10 cents land with 1800 sqft built-up
Price: 85 lakhs negotiable
Contact: 9876543210

Good water supply, peaceful area`;

  return (
    <AppLayout>
      <div className="container py-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PenLine className="h-6 w-6 text-primary" />
            Manual Post Input
          </h1>
          <p className="text-muted-foreground">Add raw posts for parsing</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-6">
            <Tabs defaultValue="single">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single Post</TabsTrigger>
                <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
              </TabsList>

              <TabsContent value="single" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Add Single Post</CardTitle>
                    <CardDescription>
                      Paste a Facebook post to extract property data
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="author">Author Name (Optional)</Label>
                      <Input
                        id="author"
                        value={authorName}
                        onChange={(e) => setAuthorName(e.target.value)}
                        placeholder="Original poster's name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="content">Post Content</Label>
                      <Textarea
                        id="content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={examplePost}
                        rows={8}
                        className="font-mono text-sm"
                      />
                    </div>
                    <Button 
                      onClick={handleSingleSubmit} 
                      disabled={isSubmitting || !content.trim()}
                      className="w-full"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Submit for Parsing
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bulk" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Bulk Import</CardTitle>
                    <CardDescription>
                      Paste multiple posts separated by blank lines
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="bulk">Posts (separated by blank lines)</Label>
                      <Textarea
                        id="bulk"
                        value={bulkContent}
                        onChange={(e) => setBulkContent(e.target.value)}
                        placeholder={`Post 1 content here...\n\nPost 2 content here...\n\nPost 3 content here...`}
                        rows={12}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {bulkContent.split(/\n{2,}/).filter((p) => p.trim()).length} posts detected
                      </p>
                      <Button 
                        onClick={handleBulkSubmit} 
                        disabled={isSubmitting || !bulkContent.trim()}
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Submit All
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Tips Card */}
            <Card className="bg-accent/30 border-accent">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Parsing Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>• Include property type (land, house, plot)</p>
                <p>• Mention locality/area name clearly</p>
                <p>• Include price with units (lakhs, crores)</p>
                <p>• Add land area with units (cents, sqft, guntha)</p>
                <p>• Contact numbers will be extracted automatically</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Posts Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Posts
              </CardTitle>
              <CardDescription>
                Recently added posts awaiting parsing
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : recentPosts.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No posts yet</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {recentPosts.map((post) => (
                      <div
                        key={post.id}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {post.is_processed ? (
                              <Badge variant="outline" className="text-green-600 border-green-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Processed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                            {post.author_name && (
                              <span className="text-xs text-muted-foreground">
                                by {post.author_name}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm line-clamp-3 whitespace-pre-wrap">
                          {post.content}
                        </p>
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