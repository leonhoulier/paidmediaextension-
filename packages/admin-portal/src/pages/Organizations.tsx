import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  useOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
} from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Plus, Loader2, Building, Pencil, Trash2 } from 'lucide-react';
import type { Organization } from '@media-buying-governance/shared';
import { SubscriptionPlan } from '@media-buying-governance/shared';

/** Form field error messages */
interface OrganizationFormErrors {
  name?: string;
  slug?: string;
  plan?: string;
  settings?: string;
}

/** Form state for creating/editing an organization */
interface OrganizationFormState {
  name: string;
  slug: string;
  plan: SubscriptionPlan | undefined;
  settings: string;
}

const INITIAL_FORM_STATE: OrganizationFormState = {
  name: '',
  slug: '',
  plan: undefined,
  settings: '{}',
};

/** Subscription plan display labels */
const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.FREE]: 'Free',
  [SubscriptionPlan.PRO]: 'Pro',
  [SubscriptionPlan.ENTERPRISE]: 'Enterprise',
};

/** Subscription plan badge variants */
const PLAN_BADGE_VARIANTS: Record<SubscriptionPlan, 'secondary' | 'default' | 'outline'> = {
  [SubscriptionPlan.FREE]: 'secondary',
  [SubscriptionPlan.PRO]: 'default',
  [SubscriptionPlan.ENTERPRISE]: 'outline',
};

/** Subscription plan options for the dropdown */
const PLAN_OPTIONS: SubscriptionPlan[] = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.PRO,
  SubscriptionPlan.ENTERPRISE,
];

/**
 * Validate slug format (lowercase, alphanumeric + hyphens only)
 */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Validate organization form fields.
 * Returns an errors object; empty object means valid.
 */
function validateOrganizationForm(
  form: OrganizationFormState,
  isEdit: boolean
): OrganizationFormErrors {
  const errors: OrganizationFormErrors = {};

  // Name validation
  if (!form.name.trim() || form.name.trim().length < 2) {
    errors.name = 'Organization name is required (min 2 characters).';
  } else if (form.name.trim().length > 100) {
    errors.name = 'Organization name must be at most 100 characters.';
  }

  // Slug validation (required for create, read-only for edit)
  if (!isEdit) {
    if (!form.slug.trim()) {
      errors.slug = 'Slug is required.';
    } else if (!isValidSlug(form.slug.trim())) {
      errors.slug = 'Slug must be lowercase, alphanumeric characters and hyphens only.';
    }
  }

  // Plan validation
  if (!form.plan) {
    errors.plan = 'Subscription plan is required.';
  }

  // Settings validation (must be valid JSON)
  if (form.settings.trim()) {
    try {
      JSON.parse(form.settings);
    } catch {
      errors.settings = 'Settings must be valid JSON.';
    }
  }

  return errors;
}

/**
 * Format date as "MMM DD, YYYY"
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

/**
 * Organizations list page - displays all organizations (super admin only)
 */
export function Organizations(): React.ReactElement {
  const { data: organizations, isLoading, error } = useOrganizations();
  const createOrganization = useCreateOrganization();
  const updateOrganization = useUpdateOrganization();
  const deleteOrganization = useDeleteOrganization();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [form, setForm] = useState<OrganizationFormState>(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState<OrganizationFormErrors>({});

  // The organization being edited or deleted
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);

  // For delete confirmation (type-to-confirm)
  const [deleteConfirmationSlug, setDeleteConfirmationSlug] = useState('');

  /** Reset form and errors */
  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM_STATE);
    setFormErrors({});
    setDeleteConfirmationSlug('');
  }, []);

  /** Open the create dialog */
  const openCreateDialog = useCallback(() => {
    resetForm();
    setCreateDialogOpen(true);
  }, [resetForm]);

  /** Open the edit dialog, pre-filling form fields */
  const openEditDialog = useCallback((organization: Organization) => {
    setSelectedOrganization(organization);
    setForm({
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      settings: JSON.stringify(organization.settings, null, 2),
    });
    setFormErrors({});
    setEditDialogOpen(true);
  }, []);

  /** Open the delete confirmation dialog */
  const openDeleteDialog = useCallback((organization: Organization) => {
    setSelectedOrganization(organization);
    setDeleteConfirmationSlug('');
    setDeleteDialogOpen(true);
  }, []);

  /** Handle create organization submission */
  const handleCreate = useCallback(() => {
    const errors = validateOrganizationForm(form, false);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    let settingsObj: Record<string, unknown> = {};
    try {
      settingsObj = form.settings.trim() ? JSON.parse(form.settings) : {};
    } catch {
      toast.error('Invalid JSON in settings field.');
      return;
    }

    createOrganization.mutate(
      {
        name: form.name.trim(),
        slug: form.slug.trim(),
        plan: form.plan as SubscriptionPlan,
        settings: settingsObj,
      } as Omit<Organization, 'id' | 'createdAt'>,
      {
        onSuccess: () => {
          toast.success(`Organization "${form.name.trim()}" created.`);
          setCreateDialogOpen(false);
          resetForm();
        },
        onError: () => {
          toast.error('Failed to create organization. Please try again.');
        },
      }
    );
  }, [form, createOrganization, resetForm]);

  /** Handle edit organization submission */
  const handleEdit = useCallback(() => {
    if (!selectedOrganization) return;
    const errors = validateOrganizationForm(form, true);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    let settingsObj: Record<string, unknown> = {};
    try {
      settingsObj = form.settings.trim() ? JSON.parse(form.settings) : {};
    } catch {
      toast.error('Invalid JSON in settings field.');
      return;
    }

    updateOrganization.mutate(
      {
        id: selectedOrganization.id,
        name: form.name.trim(),
        plan: form.plan,
        settings: settingsObj,
      },
      {
        onSuccess: () => {
          toast.success(`Organization "${form.name.trim()}" updated.`);
          setEditDialogOpen(false);
          resetForm();
          setSelectedOrganization(null);
        },
        onError: () => {
          toast.error('Failed to update organization. Please try again.');
        },
      }
    );
  }, [form, selectedOrganization, updateOrganization, resetForm]);

  /** Handle delete organization confirmation */
  const handleDelete = useCallback(() => {
    if (!selectedOrganization) return;
    if (deleteConfirmationSlug !== selectedOrganization.slug) {
      toast.error('Please type the organization slug to confirm deletion.');
      return;
    }

    deleteOrganization.mutate(selectedOrganization.id, {
      onSuccess: () => {
        toast.success(`Organization "${selectedOrganization.name}" deleted.`);
        setDeleteDialogOpen(false);
        setSelectedOrganization(null);
        resetForm();
      },
      onError: () => {
        toast.error('Failed to delete organization. Please try again.');
      },
    });
  }, [selectedOrganization, deleteOrganization, deleteConfirmationSlug, resetForm]);

  /** Update a single form field */
  const updateField = useCallback(
    (field: keyof OrganizationFormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear the error for this field when user types
      if (formErrors[field]) {
        setFormErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [formErrors]
  );

  /** Shared form fields JSX used for both create and edit dialogs */
  const renderFormFields = (isEdit: boolean): React.ReactElement => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="org-name">
          Organization Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="org-name"
          name="name"
          placeholder="e.g. Acme Corp"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          className={formErrors.name ? 'border-destructive' : ''}
          maxLength={100}
          autoFocus
        />
        {formErrors.name && <p className="text-sm text-destructive">{formErrors.name}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="org-slug">
          Slug <span className="text-destructive">*</span>
        </Label>
        <Input
          id="org-slug"
          name="slug"
          placeholder="e.g. acme-corp"
          value={form.slug}
          onChange={(e) => updateField('slug', e.target.value.toLowerCase())}
          className={formErrors.slug ? 'border-destructive' : ''}
          disabled={isEdit}
          maxLength={100}
        />
        {formErrors.slug && <p className="text-sm text-destructive">{formErrors.slug}</p>}
        {isEdit && (
          <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="org-plan">
          Subscription Plan <span className="text-destructive">*</span>
        </Label>
        <Select value={form.plan} onValueChange={(value) => updateField('plan', value)}>
          <SelectTrigger
            id="org-plan"
            className={formErrors.plan ? 'border-destructive' : ''}
          >
            <SelectValue placeholder="Select a plan" />
          </SelectTrigger>
          <SelectContent>
            {PLAN_OPTIONS.map((plan) => (
              <SelectItem key={plan} value={plan}>
                {PLAN_LABELS[plan]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formErrors.plan && <p className="text-sm text-destructive">{formErrors.plan}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="org-settings">Settings (JSON)</Label>
        <Textarea
          id="org-settings"
          name="settings"
          placeholder='{"key": "value"}'
          value={form.settings}
          onChange={(e) => updateField('settings', e.target.value)}
          className={formErrors.settings ? 'border-destructive font-mono text-sm' : 'font-mono text-sm'}
          rows={6}
        />
        {formErrors.settings && (
          <p className="text-sm text-destructive">{formErrors.settings}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Optional: Advanced settings as JSON object.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Organizations</h1>
          <p className="mt-1 text-muted-foreground">
            Manage organizations and subscription plans.
          </p>
        </div>
        <Button
          className="gap-2"
          aria-label="Create new organization"
          onClick={openCreateDialog}
        >
          <Plus className="h-4 w-4" />
          Create Organization
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="sr-only">Loading organizations...</span>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">Failed to load organizations. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {organizations && organizations.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Building className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No organizations created yet.</p>
            <Button className="gap-2" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              Create your first organization
            </Button>
          </CardContent>
        </Card>
      )}

      {organizations && organizations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {organizations.length} Organization{organizations.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Slug</th>
                    <th className="pb-3 pr-4 font-medium">Plan</th>
                    <th className="pb-3 pr-4 font-medium">Created</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => (
                    <tr key={org.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{org.name}</td>
                      <td className="py-3 pr-4 font-mono text-sm text-muted-foreground">
                        {org.slug}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={PLAN_BADGE_VARIANTS[org.plan]}>
                          {PLAN_LABELS[org.plan]}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground">
                        {formatDate(org.createdAt)}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(org)}
                            aria-label={`Edit organization ${org.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(org)}
                            aria-label={`Delete organization ${org.name}`}
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

      {/* ── Create Organization Dialog ───────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Add a new organization to the platform.
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
              disabled={createOrganization.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createOrganization.isPending}>
              {createOrganization.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createOrganization.isPending ? 'Creating...' : 'Create Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Organization Dialog ─────────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>Update organization details and plan.</DialogDescription>
          </DialogHeader>
          {renderFormFields(true)}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                resetForm();
                setSelectedOrganization(null);
              }}
              disabled={updateOrganization.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateOrganization.isPending}>
              {updateOrganization.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {updateOrganization.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Organization Confirmation ─────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{selectedOrganization?.name}&rdquo;? This
              will permanently delete the organization and all associated data (teams, users,
              rules, etc.). This action cannot be undone.
              <br />
              <br />
              Type <strong className="font-mono">{selectedOrganization?.slug}</strong> to
              confirm:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              value={deleteConfirmationSlug}
              onChange={(e) => setDeleteConfirmationSlug(e.target.value)}
              placeholder="Type organization slug"
              className="font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteOrganization.isPending}
              onClick={() => {
                setDeleteDialogOpen(false);
                setSelectedOrganization(null);
                setDeleteConfirmationSlug('');
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={
                deleteOrganization.isPending ||
                deleteConfirmationSlug !== selectedOrganization?.slug
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteOrganization.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteOrganization.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
