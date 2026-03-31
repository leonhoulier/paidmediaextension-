import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  useRuleSets,
  useCreateRuleSet,
  useUpdateRuleSet,
  useDeleteRuleSet,
  useAccounts,
  useTeams,
  useRules,
} from '@/hooks/useApi';
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
import { Plus, Loader2, Layers, Pencil, Trash2 } from 'lucide-react';
import type { RuleSet } from '@media-buying-governance/shared';

/** Form field error messages */
interface RuleSetFormErrors {
  name?: string;
  description?: string;
}

/** Form state for creating/editing a rule set */
interface RuleSetFormState {
  name: string;
  description: string;
  accountIds: string[];
  teamIds: string[];
  buyerIds: string[];
  active: boolean;
}

const INITIAL_FORM_STATE: RuleSetFormState = {
  name: '',
  description: '',
  accountIds: [],
  teamIds: [],
  buyerIds: [],
  active: true,
};

/**
 * Validate rule set form fields.
 * Returns an errors object; empty object means valid.
 */
function validateRuleSetForm(form: RuleSetFormState): RuleSetFormErrors {
  const errors: RuleSetFormErrors = {};
  if (!form.name.trim() || form.name.trim().length < 2) {
    errors.name = 'Rule set name is required (min 2 characters).';
  } else if (form.name.trim().length > 100) {
    errors.name = 'Rule set name must be at most 100 characters.';
  }
  if (form.description.length > 500) {
    errors.description = 'Description must be at most 500 characters.';
  }
  return errors;
}

/**
 * Rule Sets list page - displays all rule sets
 */
export function RuleSets(): React.ReactElement {
  const { data: ruleSets, isLoading, error } = useRuleSets();
  const { data: accounts } = useAccounts();
  const { data: teams } = useTeams();
  const { data: rules } = useRules();
  const createRuleSet = useCreateRuleSet();
  const updateRuleSet = useUpdateRuleSet();
  const deleteRuleSet = useDeleteRuleSet();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [form, setForm] = useState<RuleSetFormState>(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState<RuleSetFormErrors>({});

  // The rule set being edited or deleted
  const [selectedRuleSet, setSelectedRuleSet] = useState<RuleSet | null>(null);

  // Type-to-confirm deletion
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  /** Get count of rules in a rule set */
  const getRulesCount = useCallback(
    (ruleSetId: string): number => {
      return rules?.filter((r) => r.ruleSetId === ruleSetId).length || 0;
    },
    [rules]
  );

  /** Reset form and errors */
  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM_STATE);
    setFormErrors({});
    setDeleteConfirmText('');
  }, []);

  /** Open the create dialog */
  const openCreateDialog = useCallback(() => {
    resetForm();
    setCreateDialogOpen(true);
  }, [resetForm]);

  /** Open the edit dialog, pre-filling form fields */
  const openEditDialog = useCallback((ruleSet: RuleSet) => {
    setSelectedRuleSet(ruleSet);
    setForm({
      name: ruleSet.name,
      description: ruleSet.description ?? '',
      accountIds: ruleSet.accountIds,
      teamIds: ruleSet.teamIds,
      buyerIds: ruleSet.buyerIds,
      active: ruleSet.active,
    });
    setFormErrors({});
    setEditDialogOpen(true);
  }, []);

  /** Open the delete confirmation dialog */
  const openDeleteDialog = useCallback((ruleSet: RuleSet) => {
    setSelectedRuleSet(ruleSet);
    setDeleteConfirmText('');
    setDeleteDialogOpen(true);
  }, []);

  /** Handle create rule set submission */
  const handleCreate = useCallback(() => {
    const errors = validateRuleSetForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    createRuleSet.mutate(
      {
        name: form.name.trim(),
        description: form.description.trim() || '',
        accountIds: form.accountIds,
        teamIds: form.teamIds,
        buyerIds: form.buyerIds,
        active: form.active,
      } as Omit<RuleSet, 'id' | 'organizationId' | 'version'>,
      {
        onSuccess: () => {
          toast.success(`Rule set "${form.name.trim()}" created.`);
          setCreateDialogOpen(false);
          resetForm();
        },
        onError: () => {
          toast.error('Failed to create rule set. Please try again.');
        },
      }
    );
  }, [form, createRuleSet, resetForm]);

  /** Handle edit rule set submission */
  const handleEdit = useCallback(() => {
    if (!selectedRuleSet) return;
    const errors = validateRuleSetForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    updateRuleSet.mutate(
      {
        id: selectedRuleSet.id,
        name: form.name.trim(),
        description: form.description.trim() || '',
        accountIds: form.accountIds,
        teamIds: form.teamIds,
        buyerIds: form.buyerIds,
        active: form.active,
      },
      {
        onSuccess: () => {
          toast.success(`Rule set "${form.name.trim()}" updated.`);
          setEditDialogOpen(false);
          resetForm();
          setSelectedRuleSet(null);
        },
        onError: () => {
          toast.error('Failed to update rule set. Please try again.');
        },
      }
    );
  }, [form, selectedRuleSet, updateRuleSet, resetForm]);

  /** Handle delete rule set confirmation */
  const handleDelete = useCallback(() => {
    if (!selectedRuleSet) return;
    if (deleteConfirmText !== selectedRuleSet.name) {
      toast.error('Please type the rule set name to confirm deletion.');
      return;
    }

    deleteRuleSet.mutate(selectedRuleSet.id, {
      onSuccess: () => {
        toast.success(`Rule set "${selectedRuleSet.name}" deleted.`);
        setDeleteDialogOpen(false);
        setSelectedRuleSet(null);
        resetForm();
      },
      onError: () => {
        toast.error('Failed to delete rule set. Please try again.');
      },
    });
  }, [selectedRuleSet, deleteConfirmText, deleteRuleSet, resetForm]);

  /** Update a single form field */
  const updateField = useCallback(
    (field: keyof RuleSetFormState, value: string | string[] | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear the error for this field when user types
      if (formErrors[field as keyof RuleSetFormErrors]) {
        setFormErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [formErrors]
  );

  /** Toggle account selection */
  const toggleAccount = useCallback((accountId: string) => {
    setForm((prev) => {
      const accountIds = prev.accountIds.includes(accountId)
        ? prev.accountIds.filter((id) => id !== accountId)
        : [...prev.accountIds, accountId];
      return { ...prev, accountIds };
    });
  }, []);

  /** Toggle team selection */
  const toggleTeam = useCallback((teamId: string) => {
    setForm((prev) => {
      const teamIds = prev.teamIds.includes(teamId)
        ? prev.teamIds.filter((id) => id !== teamId)
        : [...prev.teamIds, teamId];
      return { ...prev, teamIds };
    });
  }, []);

  /** Shared form fields JSX used for both create and edit dialogs */
  const renderFormFields = (isEdit: boolean): React.ReactElement => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="ruleset-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="ruleset-name"
          name="name"
          placeholder="e.g. Q1 2024 Campaign Rules"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          className={formErrors.name ? 'border-destructive' : ''}
          maxLength={100}
          autoFocus
        />
        {formErrors.name && <p className="text-sm text-destructive">{formErrors.name}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ruleset-description">Description</Label>
        <Textarea
          id="ruleset-description"
          name="description"
          placeholder="Brief description of this rule set"
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
        <Label>Accounts</Label>
        <div className="rounded-md border p-3 max-h-48 overflow-y-auto">
          {accounts && accounts.length > 0 ? (
            <div className="space-y-2">
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className="flex items-center gap-2 cursor-pointer rounded p-2 hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={form.accountIds.includes(account.id)}
                    onChange={() => toggleAccount(account.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">{account.accountName}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No accounts available</p>
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Teams</Label>
        <div className="rounded-md border p-3 max-h-48 overflow-y-auto">
          {teams && teams.length > 0 ? (
            <div className="space-y-2">
              {teams.map((team) => (
                <label
                  key={team.id}
                  className="flex items-center gap-2 cursor-pointer rounded p-2 hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={form.teamIds.includes(team.id)}
                    onChange={() => toggleTeam(team.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">{team.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No teams available</p>
          )}
        </div>
      </div>
      {isEdit && selectedRuleSet && (
        <div className="grid gap-2">
          <Label>Rules in this set</Label>
          <p className="text-sm text-muted-foreground">
            This rule set contains {getRulesCount(selectedRuleSet.id)} rule(s)
          </p>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="ruleset-active" className="flex items-center gap-2">
          <input
            type="checkbox"
            id="ruleset-active"
            checked={form.active}
            onChange={(e) => updateField('active', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span>Active</span>
        </Label>
        <p className="text-xs text-muted-foreground">
          Inactive rule sets will not apply their rules
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Rule Sets</h1>
          <p className="mt-1 text-muted-foreground">
            Manage rule sets and their assignments to accounts and teams.
          </p>
        </div>
        <Button className="gap-2" aria-label="Create new rule set" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Create Rule Set
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="sr-only">Loading rule sets...</span>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">Failed to load rule sets. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {ruleSets && ruleSets.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Layers className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No rule sets created yet.</p>
            <Button className="gap-2" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              Create your first rule set
            </Button>
          </CardContent>
        </Card>
      )}

      {ruleSets && ruleSets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {ruleSets.length} Rule Set{ruleSets.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Description</th>
                    <th className="pb-3 pr-4 font-medium">Rules</th>
                    <th className="pb-3 pr-4 font-medium">Accounts</th>
                    <th className="pb-3 pr-4 font-medium">Teams</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleSets.map((ruleSet) => (
                    <tr key={ruleSet.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{ruleSet.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {ruleSet.description || '--'}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">{getRulesCount(ruleSet.id)}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">{ruleSet.accountIds.length}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">{ruleSet.teamIds.length}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={ruleSet.active ? 'success' : 'secondary'}>
                          {ruleSet.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(ruleSet)}
                            aria-label={`Edit rule set ${ruleSet.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(ruleSet)}
                            aria-label={`Delete rule set ${ruleSet.name}`}
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

      {/* ── Create Rule Set Dialog ───────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Rule Set</DialogTitle>
            <DialogDescription>
              Create a new rule set and assign it to accounts and teams.
            </DialogDescription>
          </DialogHeader>
          {renderFormFields(false)}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                resetForm();
              }}
              disabled={createRuleSet.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createRuleSet.isPending}>
              {createRuleSet.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createRuleSet.isPending ? 'Creating...' : 'Create Rule Set'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Rule Set Dialog ─────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Rule Set</DialogTitle>
            <DialogDescription>Update rule set details and assignments.</DialogDescription>
          </DialogHeader>
          {renderFormFields(true)}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                resetForm();
                setSelectedRuleSet(null);
              }}
              disabled={updateRuleSet.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateRuleSet.isPending}>
              {updateRuleSet.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {updateRuleSet.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Rule Set Confirmation ─────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule Set</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This rule set contains <strong>{selectedRuleSet && getRulesCount(selectedRuleSet.id)}</strong> rule(s).
                Deleting will orphan these rules.
              </p>
              <p>
                To confirm deletion, please type the rule set name:{' '}
                <strong>{selectedRuleSet?.name}</strong>
              </p>
              <Input
                placeholder="Type rule set name here"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="mt-2"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteRuleSet.isPending}
              onClick={() => {
                setDeleteDialogOpen(false);
                setSelectedRuleSet(null);
                setDeleteConfirmText('');
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteRuleSet.isPending || deleteConfirmText !== selectedRuleSet?.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRuleSet.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteRuleSet.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
