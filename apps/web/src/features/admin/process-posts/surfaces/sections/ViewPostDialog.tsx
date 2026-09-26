import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Edit } from 'lucide-react';
import type { ProcessPostsViewerView, ProcessPostsViewerCommands } from '../processPostsSurfaceContract';

export interface ViewPostDialogProps {
  view: ProcessPostsViewerView;
  commands: ProcessPostsViewerCommands;
}

/** Issue #2662 — moved verbatim from ProcessPosts.tsx's "View Post Dialog". */
export function ViewPostDialog({ view, commands }: ViewPostDialogProps) {
  const { viewingPost } = view;
  const { close, editViewed } = commands;

  return (
    <Dialog open={!!viewingPost} onOpenChange={close}>
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
          <Button variant="outline" onClick={close}>
            Close
          </Button>
          <Button onClick={editViewed}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
