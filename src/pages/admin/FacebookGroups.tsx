import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useFacebookGroups,
  useCreateFacebookGroup,
  useUpdateFacebookGroup,
  useDeleteFacebookGroup,
  FacebookGroup,
} from '@/hooks/useAdminData';
import { Plus, Pencil, Trash2, ExternalLink, Loader2, Users, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default function FacebookGroups() {
  const { data: groups = [], isLoading } = useFacebookGroups();
  const createGroup = useCreateFacebookGroup();
  const updateGroup = useUpdateFacebookGroup();
  const deleteGroup = useDeleteFacebookGroup();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FacebookGroup | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: '',
    is_enabled: true,
    automation_enabled: false,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      description: '',
      is_enabled: true,
      automation_enabled: false,
    });
  };

  const handleCreate = async () => {
    await createGroup.mutateAsync(formData);
    setIsCreateOpen(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingGroup) return;
    await updateGroup.mutateAsync({ id: editingGroup.id, updates: formData });
    setEditingGroup(null);
    resetForm();
  };

  const handleEdit = (group: FacebookGroup) => {
    setFormData({
      name: group.name,
      url: group.url,
      description: group.description || '',
      is_enabled: group.is_enabled,
      automation_enabled: group.automation_enabled,
    });
    setEditingGroup(group);
  };

  const handleToggleEnabled = async (group: FacebookGroup) => {
    await updateGroup.mutateAsync({
      id: group.id,
      updates: { is_enabled: !group.is_enabled },
    });
  };

  const FormContent = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Group Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Udupi Real Estate Group"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="url">Facebook Group URL</Label>
        <Input
          id="url"
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          placeholder="https://facebook.com/groups/..."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Notes about this group..."
          rows={3}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="enabled">Enabled</Label>
          <p className="text-sm text-muted-foreground">Include in feed runs</p>
        </div>
        <Switch
          id="enabled"
          checked={formData.is_enabled}
          onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-warning/50 bg-warning/10 p-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <Label htmlFor="automation" className="text-warning">Automation (Experimental)</Label>
          </div>
          <p className="text-sm text-muted-foreground">Auto-fetch posts periodically</p>
        </div>
        <Switch
          id="automation"
          checked={formData.automation_enabled}
          onCheckedChange={(checked) => setFormData({ ...formData, automation_enabled: checked })}
        />
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="container py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Facebook Groups
            </h1>
            <p className="text-muted-foreground">Manage ingestion sources</p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Add Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Facebook Group</DialogTitle>
                <DialogDescription>
                  Add a new Facebook group to track for property listings.
                </DialogDescription>
              </DialogHeader>
              <FormContent />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createGroup.isPending || !formData.name || !formData.url}>
                  {createGroup.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Group
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No groups yet</p>
              <p className="text-muted-foreground mb-4">Add a Facebook group to start tracking listings</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Group
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Automation</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{group.name}</p>
                        <a
                          href={group.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Group
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={group.is_enabled}
                        onCheckedChange={() => handleToggleEnabled(group)}
                      />
                    </TableCell>
                    <TableCell>
                      {group.automation_enabled ? (
                        <Badge variant="outline" className="text-warning border-warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Experimental
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Manual</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(group.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(group)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Group?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will also delete all associated feed runs and raw posts. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteGroup.mutate(group.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Facebook Group</DialogTitle>
              <DialogDescription>
                Update the group details.
              </DialogDescription>
            </DialogHeader>
            <FormContent />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingGroup(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={updateGroup.isPending}>
                {updateGroup.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}