import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Eye, Edit, RotateCcw, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ProcessPostsRawPostsView, ProcessPostsRawPostsCommands } from '../processPostsSurfaceContract';

export interface RawPostsBrowserCardProps {
  view: ProcessPostsRawPostsView;
  commands: ProcessPostsRawPostsCommands;
}

/** Issue #2662 — moved verbatim from ProcessPosts.tsx's "Raw Posts" card. */
export function RawPostsBrowserCard({ view, commands }: RawPostsBrowserCardProps) {
  const { unprocessedPosts, processedPosts, isResettingAll } = view;
  const { viewPost, editPost, resetPost, resetAll } = commands;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Raw Posts
        </CardTitle>
        <CardDescription>View and edit raw posts before processing</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending">Pending ({unprocessedPosts.length})</TabsTrigger>
            <TabsTrigger value="processed">Processed ({processedPosts.length})</TabsTrigger>
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
                          <Button size="sm" variant="ghost" onClick={() => viewPost(post)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => editPost(post)}>
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
            <div className="space-y-3">
              {processedPosts.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={resetAll}
                  disabled={isResettingAll}
                >
                  {isResettingAll ? (
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3 mr-2" />
                  )}
                  Reset All for Reprocessing ({processedPosts.length})
                </Button>
              )}
              <ScrollArea className="h-[260px] pr-4">
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
                            <Button size="sm" variant="ghost" onClick={() => viewPost(post)}>
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resetPost(post.id)}
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
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
