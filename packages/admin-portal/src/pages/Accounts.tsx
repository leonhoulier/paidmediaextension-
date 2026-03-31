import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount } from '@/hooks/useApi';
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
import { Plus, Loader2, Building2, Pencil, Trash2 } from 'lucide-react';
import { Platform } from '@media-buying-governance/shared';
import type { AdAccount } from '@media-buying-governance/shared';

/** Label map for platform display */
const platformLabels: Record<string, string> = {
  [Platform.META]: 'Meta',
  [Platform.GOOGLE_ADS]: 'Google Ads',
  [Platform.ALL]: 'All Platforms',
};

/** Form field error messages */
interface AccountFormErrors {
  accountName?: string;
  platform?: string;
  platformAccountId?: string;
  market?: string;
}

/** Form state for creating/editing an account */
interface AccountFormState {
  accountName: string;
  platform: string;
  platformAccountId: string;
  market: string;
}

const INITIAL_FORM_STATE: AccountFormState = {
  accountName: '',
  platform: '',
  platformAccountId: '',
  market: '',
};

/**
 * Validate account form fields.
 * Returns an errors object; empty object means valid.
 */
function validateAccountForm(form: AccountFormState): AccountFormErrors {
  const errors: AccountFormErrors = {};
  if (!form.accountName.trim() || form.accountName.trim().length < 2) {
    errors.accountName = 'Account name is required (min 2 characters).';
  } else if (form.accountName.trim().length > 100) {
    errors.accountName = 'Account name must be at most 100 characters.';
  }
  if (!form.platform) {
    errors.platform = 'Platform is required.';
  } else if (form.platform !== Platform.META && form.platform !== Platform.GOOGLE_ADS) {
    errors.platform = 'Platform must be Meta or Google Ads.';
  }
  if (!form.platformAccountId.trim() || form.platformAccountId.trim().length < 3) {
    errors.platformAccountId = 'Platform Account ID is required (min 3 characters).';
  } else if (form.platformAccountId.trim().length > 50) {
    errors.platformAccountId = 'Platform Account ID must be at most 50 characters.';
  }
  if (form.market.length > 50) {
    errors.market = 'Market must be at most 50 characters.';
  }
  return errors;
}

/**
 * Accounts list page - displays all registered ad accounts
 */
export function Accounts(): React.ReactElement {
  const { data: accounts, isLoading, error } = useAccounts();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [form, setForm] = useState<AccountFormState>(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState<AccountFormErrors>({});

  // The account being edited or deleted
  const [selectedAccount, setSelectedAccount] = useState<AdAccount | null>(null);

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
  const openEditDialog = useCallback((account: AdAccount) => {
    setSelectedAccount(account);
    setForm({
      accountName: account.accountName,
      platform: account.platform,
      platformAccountId: account.platformAccountId,
      market: account.market ?? '',
    });
    setFormErrors({});
    setEditDialogOpen(true);
  }, []);

  /** Open the delete confirmation dialog */
  const openDeleteDialog = useCallback((account: AdAccount) => {
    setSelectedAccount(account);
    setDeleteDialogOpen(true);
  }, []);

  /** Handle create account submission */
  const handleCreate = useCallback(() => {
    const errors = validateAccountForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    createAccount.mutate(
      {
        accountName: form.accountName.trim(),
        platform: form.platform as Platform,
        platformAccountId: form.platformAccountId.trim(),
        market: form.market.trim() || undefined,
        active: true,
      } as Omit<AdAccount, 'id' | 'organizationId'>,
      {
        onSuccess: () => {
          toast.success(`Account "${form.accountName.trim()}" created.`);
          setCreateDialogOpen(false);
          resetForm();
        },
        onError: () => {
          toast.error('Failed to create account. Please try again.');
        },
      },
    );
  }, [form, createAccount, resetForm]);

  /** Handle edit account submission */
  const handleEdit = useCallback(() => {
    if (!selectedAccount) return;
    const errors = validateAccountForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    updateAccount.mutate(
      {
        id: selectedAccount.id,
        accountName: form.accountName.trim(),
        platform: form.platform as Platform,
        platformAccountId: form.platformAccountId.trim(),
        market: form.market.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Account "${form.accountName.trim()}" updated.`);
          setEditDialogOpen(false);
          resetForm();
          setSelectedAccount(null);
        },
        onError: () => {
          toast.error('Failed to update account. Please try again.');
        },
      },
    );
  }, [form, selectedAccount, updateAccount, resetForm]);

  /** Handle delete account confirmation */
  const handleDelete = useCallback(() => {
    if (!selectedAccount) return;
    deleteAccount.mutate(selectedAccount.id, {
      onSuccess: () => {
        toast.success(`Account "${selectedAccount.accountName}" deleted.`);
        setDeleteDialogOpen(false);
        setSelectedAccount(null);
      },
      onError: () => {
        toast.error('Failed to delete account. Please try again.');
      },
    });
  }, [selectedAccount, deleteAccount]);

  /** Update a single form field */
  const updateField = useCallback(
    (field: keyof AccountFormState, value: string) => {
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
        <Label htmlFor="account-name">
          Account Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="account-name"
          name="accountName"
          placeholder="e.g. Main Meta Account"
          value={form.accountName}
          onChange={(e) => updateField('accountName', e.target.value)}
          className={formErrors.accountName ? 'border-destructive' : ''}
          maxLength={100}
          autoFocus
        />
        {formErrors.accountName && (
          <p className="text-sm text-destructive">{formErrors.accountName}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="account-platform">
          Platform <span className="text-destructive">*</span>
        </Label>
        <Select value={form.platform} onValueChange={(value) => updateField('platform', value)}>
          <SelectTrigger
            id="account-platform"
            className={formErrors.platform ? 'border-destructive' : ''}
          >
            <SelectValue placeholder="Select platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={Platform.META}>Meta</SelectItem>
            <SelectItem value={Platform.GOOGLE_ADS}>Google Ads</SelectItem>
          </SelectContent>
        </Select>
        {formErrors.platform && (
          <p className="text-sm text-destructive">{formErrors.platform}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="account-platform-id">
          Platform Account ID <span className="text-destructive">*</span>
        </Label>
        <Input
          id="account-platform-id"
          name="platformAccountId"
          placeholder={
            form.platform === Platform.GOOGLE_ADS
              ? 'e.g. 123-456-7890'
              : 'e.g. act_123456'
          }
          value={form.platformAccountId}
          onChange={(e) => updateField('platformAccountId', e.target.value)}
          className={formErrors.platformAccountId ? 'border-destructive' : ''}
          maxLength={50}
        />
        {formErrors.platformAccountId && (
          <p className="text-sm text-destructive">{formErrors.platformAccountId}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="account-market">Market</Label>
        <Input
          id="account-market"
          name="market"
          placeholder="e.g. US, EMEA"
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
          <h1 className="text-3xl font-bold">Ad Accounts</h1>
          <p className="mt-1 text-muted-foreground">
            Manage registered ad platform accounts.
          </p>
        </div>
        <Button className="gap-2" aria-label="Add new account" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="sr-only">Loading accounts...</span>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">Failed to load accounts. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {accounts && accounts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No accounts registered yet.</p>
            <Button className="gap-2" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              Add your first account
            </Button>
          </CardContent>
        </Card>
      )}

      {accounts && accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {accounts.length} Account{accounts.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Account Name</th>
                    <th className="pb-3 pr-4 font-medium">Platform</th>
                    <th className="pb-3 pr-4 font-medium">Account ID</th>
                    <th className="pb-3 pr-4 font-medium">Market</th>
                    <th className="pb-3 pr-4 font-medium">Region</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{account.accountName}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">
                          {platformLabels[account.platform] ?? account.platform}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-sm">
                        {account.platformAccountId}
                      </td>
                      <td className="py-3 pr-4">{account.market ?? '--'}</td>
                      <td className="py-3 pr-4">{account.region ?? '--'}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={account.active ? 'success' : 'secondary'}>
                          {account.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(account)}
                            aria-label={`Edit account ${account.accountName}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(account)}
                            aria-label={`Delete account ${account.accountName}`}
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

      {/* ── Create Account Dialog ────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
            <DialogDescription>
              Register a new ad platform account.
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
              disabled={createAccount.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createAccount.isPending}>
              {createAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createAccount.isPending ? 'Creating...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Account Dialog ──────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Update account details.
            </DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                resetForm();
                setSelectedAccount(null);
              }}
              disabled={updateAccount.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateAccount.isPending}>
              {updateAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {updateAccount.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account Confirmation ──────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{selectedAccount?.accountName}&rdquo;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteAccount.isPending}
              onClick={() => {
                setDeleteDialogOpen(false);
                setSelectedAccount(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteAccount.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteAccount.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
