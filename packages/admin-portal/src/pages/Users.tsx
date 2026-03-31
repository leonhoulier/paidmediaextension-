import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useTeams,
} from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, Loader2, UserPlus, Pencil, Trash2 } from 'lucide-react';
import type { User } from '@media-buying-governance/shared';
import { UserRole } from '@media-buying-governance/shared';

/** Form field error messages */
interface UserFormErrors {
  email?: string;
  name?: string;
  role?: string;
}

/** Form state for creating/editing a user */
interface UserFormState {
  email: string;
  name: string;
  role: UserRole | undefined;
  teamIds: string[];
}

const INITIAL_FORM_STATE: UserFormState = {
  email: '',
  name: '',
  role: undefined,
  teamIds: [],
};

/** User role display labels */
const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.ADMIN]: 'Admin',
  [UserRole.VIEWER]: 'Viewer',
  [UserRole.BUYER]: 'Media Buyer',
};

/** User role options for the dropdown */
const ROLE_OPTIONS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.VIEWER,
  UserRole.BUYER,
];

/**
 * Validate user form fields.
 * Returns an errors object; empty object means valid.
 */
function validateUserForm(form: UserFormState, isEdit: boolean): UserFormErrors {
  const errors: UserFormErrors = {};

  // Email validation
  if (!isEdit) {
    // Email required only for new users
    if (!form.email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }
  }

  // Name validation
  if (!form.name.trim() || form.name.trim().length < 2) {
    errors.name = 'Name is required (min 2 characters).';
  } else if (form.name.trim().length > 100) {
    errors.name = 'Name must be at most 100 characters.';
  }

  // Role validation
  if (!form.role) {
    errors.role = 'Role is required.';
  }

  return errors;
}

/**
 * Users list page - displays all users in the organization
 */
export function Users(): React.ReactElement {
  const { data: users, isLoading, error } = useUsers();
  const { data: teams } = useTeams();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [form, setForm] = useState<UserFormState>(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState<UserFormErrors>({});

  // The user being edited or deleted
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

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
  const openEditDialog = useCallback((user: User) => {
    setSelectedUser(user);
    setForm({
      email: user.email,
      name: user.name,
      role: user.role,
      teamIds: user.teamIds,
    });
    setFormErrors({});
    setEditDialogOpen(true);
  }, []);

  /** Open the delete confirmation dialog */
  const openDeleteDialog = useCallback((user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  }, []);

  /** Handle create user submission */
  const handleCreate = useCallback(() => {
    const errors = validateUserForm(form, false);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    createUser.mutate(
      {
        email: form.email.trim(),
        name: form.name.trim(),
        role: form.role as UserRole,
        teamIds: form.teamIds,
      } as Omit<User, 'id' | 'organizationId'>,
      {
        onSuccess: () => {
          toast.success(`User "${form.name.trim()}" created.`);
          setCreateDialogOpen(false);
          resetForm();
        },
        onError: () => {
          toast.error('Failed to create user. Please try again.');
        },
      }
    );
  }, [form, createUser, resetForm]);

  /** Handle edit user submission */
  const handleEdit = useCallback(() => {
    if (!selectedUser) return;
    const errors = validateUserForm(form, true);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    updateUser.mutate(
      {
        id: selectedUser.id,
        name: form.name.trim(),
        role: form.role,
        teamIds: form.teamIds,
      },
      {
        onSuccess: () => {
          toast.success(`User "${form.name.trim()}" updated.`);
          setEditDialogOpen(false);
          resetForm();
          setSelectedUser(null);
        },
        onError: () => {
          toast.error('Failed to update user. Please try again.');
        },
      }
    );
  }, [form, selectedUser, updateUser, resetForm]);

  /** Handle delete user confirmation */
  const handleDelete = useCallback(() => {
    if (!selectedUser) return;
    deleteUser.mutate(selectedUser.id, {
      onSuccess: () => {
        toast.success(`User "${selectedUser.name}" deleted.`);
        setDeleteDialogOpen(false);
        setSelectedUser(null);
      },
      onError: () => {
        toast.error('Failed to delete user. Please try again.');
      },
    });
  }, [selectedUser, deleteUser]);

  /** Update a single form field */
  const updateField = useCallback(
    (field: keyof UserFormState, value: string | string[]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear the error for this field when user types
      if (formErrors[field as keyof UserFormErrors]) {
        setFormErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [formErrors]
  );

  /** Toggle team selection */
  const toggleTeam = useCallback((teamId: string) => {
    setForm((prev) => {
      const teamIds = prev.teamIds.includes(teamId)
        ? prev.teamIds.filter((id) => id !== teamId)
        : [...prev.teamIds, teamId];
      return { ...prev, teamIds };
    });
  }, []);

  /** Get team names for a user */
  const getTeamNames = useCallback(
    (teamIds: string[]): string => {
      if (!teams || teamIds.length === 0) return 'No teams';
      const teamNames = teamIds
        .map((id) => teams.find((t) => t.id === id)?.name)
        .filter(Boolean);
      return teamNames.length > 0 ? teamNames.join(', ') : 'No teams';
    },
    [teams]
  );

  /** Shared form fields JSX used for both create and edit dialogs */
  const renderFormFields = (isEdit: boolean): React.ReactElement => (
    <div className="grid gap-4 py-4">
      {!isEdit && (
        <div className="grid gap-2">
          <Label htmlFor="user-email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="user-email"
            name="email"
            type="email"
            placeholder="user@company.com"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            className={formErrors.email ? 'border-destructive' : ''}
            autoFocus={!isEdit}
          />
          {formErrors.email && (
            <p className="text-sm text-destructive">{formErrors.email}</p>
          )}
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="user-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="user-name"
          name="name"
          placeholder="John Doe"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          className={formErrors.name ? 'border-destructive' : ''}
          maxLength={100}
          autoFocus={isEdit}
        />
        {formErrors.name && (
          <p className="text-sm text-destructive">{formErrors.name}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="user-role">
          Role <span className="text-destructive">*</span>
        </Label>
        <Select
          value={form.role}
          onValueChange={(value) => updateField('role', value)}
        >
          <SelectTrigger
            id="user-role"
            className={formErrors.role ? 'border-destructive' : ''}
          >
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formErrors.role && (
          <p className="text-sm text-destructive">{formErrors.role}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label>Teams</Label>
        <div className="rounded-md border p-3">
          {teams && teams.length > 0 ? (
            <div className="space-y-2">
              {teams.map((team) => (
                <label
                  key={team.id}
                  className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-accent"
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
            <p className="text-sm text-muted-foreground">
              No teams available. Create teams first.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="mt-1 text-muted-foreground">
            Manage users and assign them to teams.
          </p>
        </div>
        <Button className="gap-2" aria-label="Create new user" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Create User
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="sr-only">Loading users...</span>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">Failed to load users. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {users && users.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <UserPlus className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No users created yet.</p>
            <Button className="gap-2" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              Create your first user
            </Button>
          </CardContent>
        </Card>
      )}

      {users && users.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {users.length} User{users.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Email</th>
                    <th className="pb-3 pr-4 font-medium">Role</th>
                    <th className="pb-3 pr-4 font-medium">Teams</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{user.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{user.email}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground">
                        {getTeamNames(user.teamIds)}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(user)}
                            aria-label={`Edit user ${user.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(user)}
                            aria-label={`Delete user ${user.name}`}
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

      {/* ── Create User Dialog ───────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>
              Add a new user to your organization and assign them to teams.
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
              disabled={createUser.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createUser.isPending}>
              {createUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createUser.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ─────────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details and team assignments.</DialogDescription>
          </DialogHeader>
          {renderFormFields(true)}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                resetForm();
                setSelectedUser(null);
              }}
              disabled={updateUser.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateUser.isPending}>
              {updateUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {updateUser.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete User Confirmation ─────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{selectedUser?.name}&rdquo;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteUser.isPending}
              onClick={() => {
                setDeleteDialogOpen(false);
                setSelectedUser(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteUser.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteUser.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
