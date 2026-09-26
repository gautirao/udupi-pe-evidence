import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import type { ProcessPostsEditorView, ProcessPostsEditorCommands } from '../processPostsSurfaceContract';

export interface EditPostDialogProps {
  view: ProcessPostsEditorView;
  commands: ProcessPostsEditorCommands;
}

/** Issue #2662 — moved verbatim from ProcessPosts.tsx's "Edit Post Dialog". */
export function EditPostDialog({ view, commands }: EditPostDialogProps) {
  const { editingPost, editContent, isSaving } = view;
  const { setContent, save, close } = commands;

  return (
    <Dialog open={!!editingPost} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Raw Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={editContent}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[300px] font-mono text-sm"
            placeholder="Post content..."
          />
          <p className="text-sm text-muted-foreground">Edit the content and save to mark for reprocessing.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save &amp; Reprocess
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
