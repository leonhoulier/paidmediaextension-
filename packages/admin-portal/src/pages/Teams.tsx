import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog';
import { Plus, Loader2, Users as UsersIcon, Pencil, Trash2 } from 'lucide-react';
import type { Team } from '@media-buying-governance/shared';

/** Form field error messages */
interface TeamFormErrors {
  name?: string;
  description?: string;
  market?: string;
}

/** Form state for creating/editing a team */
interface TeamFormState {
  name: string;
  description: string;
  market: string;
}

const INITIAL_FORM_STATE: TeamFormState = { name: '', description: '', market: '' };

/**
 * Validate team form fields.
 * Returns an errors object; empty object means valid.
 */
function validateTeamForm(form: TeamFormState): TeamFormErrors {
  const errors: TeamFormErrors = {};
  if (!form.name.trim() || form.name.trim().length < 2) {
    errors.name = 'Team name is required (min 2 characters).';
  } else if (form.name.trim().length > 100) {
    errors.name = 'Team name must be at most 100 characters.';
  }
  if (form.description.length > 500) {
    errors.description = 'Description must be at most 500 characters.';
  }
  if (form.market.length > 50) {
    errors.market = 'Market must be at most 50 characters.';
  }
  return errors;
}

/**
 * Teams list page - displays all teams in the organization
 */
export function Teams(): React.ReactElement {
  const { data: teams, isLoading, error } = useTeams();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [form, setForm] = useState<TeamFormState>(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState<TeamFormErrors>({});

  // The team being edited or deleted
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  /** Reset form and errors */
  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM_STATE);
    setFormErrors({});
  }, []);

  /** Open the create dialog */
  const openCreateDialog = useCallback(() => {
    resetForm();
    setCreateDialogOpen(true);
  }, [resetForm]);

  /** Open the edit dialog, pre-filling form fields */
  const openEditDialog = useCallback((team: Team) => {
    setSelectedTeam(team);
    setForm({
      name: team.name,
      description: team.description ?? '',
      market: '',
    });
    setFormErrors({});
    setEditDialogOpen(true);
  }, []);

  /** Open the delete confirmation dialog */
  const openDeleteDialog = useCallback((team: Team) => {
    setSelectedTeam(team);
    setDeleteDialogOpen(true);
  }, []);

  /** Handle create team submission */
  const handleCreate = useCallback(() => {
    const errors = validateTeamForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    createTeam.mutate(
      {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        memberIds: [],
      } as Omit<Team, 'id' | 'organizationId'>,
      {
        onSuccess: () => {
          toast.success(`Team "${form.name.trim()}" created.`);
          setCreateDialogOpen(false);
          resetForm();
        },
        onError: () => {
          toast.error('Failed to create team. Please try again.');
        },
      },
    );
  }, [form, createTeam, resetForm]);

  /** Handle edit team submission */
  const handleEdit = useCallback(() => {
    if (!selectedTeam) return;
    const errors = validateTeamForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    updateTeam.mutate(
      {
        id: selectedTeam.id,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Team "${form.name.trim()}" updated.`);
          setEditDialogOpen(false);
          resetForm();
          setSelectedTeam(null);
        },
        onError: () => {
          toast.error('Failed to update team. Please try again.');
        },
      },
    );
  }, [form, selectedTeam, updateTeam, resetForm]);

  /** Handle delete team confirmation */
  const handleDelete = useCallback(() => {
    if (!selectedTeam) return;
    deleteTeam.mutate(selectedTeam.id, {
      onSuccess: () => {
        toast.success(`Team "${selectedTeam.name}" deleted.`);
        setDeleteDialogOpen(false);
        setSelectedTeam(null);
      },
      onError: () => {
        toast.error('Failed to delete team. Please try again.');
      },
    });
  }, [selectedTeam, deleteTeam]);

  /** Update a single form field */
  const updateField = useCallback(
    (field: keyof TeamFormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear the error for this field when user types
      if (formErrors[field]) {
        setFormErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [formErrors],
  );

  /** Shared form fields JSX used for both create and edit dialogs */
  const renderFormFields = (): React.ReactElement => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="team-name">
          Team Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="team-name"
          name="name"
          placeholder="e.g. US Social"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          className={formErrors.name ? 'border-destructive' : ''}
          maxLength={100}
          autoFocus
        />
        {formErrors.name && (
          <p className="text-sm text-destructive">{formErrors.name}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="team-description">Description</Label>
        <Textarea
          id="team-description"
          name="description"
          placeholder="Brief description of the team"
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          className={formErrors.description ? 'border-destructive' : ''}
          maxLength={500}
          rows={3}
        />
        {formErrors.description && (
          <p className="text-sm text-destructive">{formErrors.description}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="team-market">Market / Region</Label>
        <Input
          id="team-market"
          name="market"
          placeholder="e.g. US, EMEA, APAC"
          value={form.market}
          onChange={(e) => updateField('market', e.target.value)}
          className={formErrors.market ? 'border-destructive' : ''}
          maxLength={50}
        />
        {formErrors.market && (
          <p className="text-sm text-destructive">{formErrors.market}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="mt-1 text-muted-foreground">Manage teams and their members.</p>
        </div>
        <Button className="gap-2" aria-label="Create new team" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Create Team
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="sr-only">Loading teams...</span>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">Failed to load teams. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {teams && teams.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <UsersIcon className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No teams created yet.</p>
            <Button className="gap-2" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              Create your first team
            </Button>
          </CardContent>
        </Card>
      )}

      {teams && teams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {teams.length} Team{teams.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Team Name</th>
                    <th className="pb-3 pr-4 font-medium">Description</th>
                    <th className="pb-3 pr-4 font-medium">Members</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{team.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {team.description ?? '--'}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">{team.memberIds.length} members</Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(team)}
                            aria-label={`Edit team ${team.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(team)}
                            aria-label={`Delete team ${team.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Create Team Dialog ───────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Add a new team to your organization.
            </DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                resetForm();
              }}
              disabled={createTeam.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createTeam.isPending}>
              {createTeam.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createTeam.isPending ? 'Creating...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Team Dialog ─────────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
            <DialogDescription>
              Update team details.
            </DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                resetForm();
                setSelectedTeam(null);
              }}
              disabled={updateTeam.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateTeam.isPending}>
              {updateTeam.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {updateTeam.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Team Confirmation ─────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{selectedTeam?.name}&rdquo;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteTeam.isPending}
              onClick={() => {
                setDeleteDialogOpen(false);
                setSelectedTeam(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteTeam.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTeam.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteTeam.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
