import React, { useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm, Controller, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Platform,
  EntityLevel,
  EnforcementMode,
  RuleType,
  RuleOperator,
} from '@media-buying-governance/shared';
import { useAccounts, useTeams, useUsers, useCreateRule, useUpdateRule, useRuleById, useRuleSets } from '@/hooks/useApi';
import { AlertTriangle, History, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RuleVersionHistory } from '@/pages/RuleVersionHistory';

/** Rule builder form schema */
const ruleBuilderSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  description: z.string().min(1, 'Description is required'),
  ruleSetId: z.string().min(1, 'Rule set is required'),
  // Step 1: Scope
  accountIds: z.array(z.string()),
  teamIds: z.array(z.string()),
  buyerIds: z.array(z.string()),
  allAccounts: z.boolean(),
  allTeams: z.boolean(),
  allBuyers: z.boolean(),
  // Step 2: Platform & Entity
  platforms: z.array(z.nativeEnum(Platform)).min(1, 'Select at least one platform'),
  entityLevels: z.array(z.nativeEnum(EntityLevel)).min(1, 'Select at least one entity level'),
  // Step 3: Rule Type & Condition
  ruleType: z.nativeEnum(RuleType),
  conditionField: z.string().optional(),
  conditionOperator: z.nativeEnum(RuleOperator),
  conditionValue: z.string().optional(),
  namingTemplateId: z.string().optional(),
  budgetType: z.string().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  requireConfirmation: z.boolean().optional(),
  targetingField: z.string().optional(),
  brandSafetyCategories: z.array(z.string()).optional(),
  // New fields for expanded rule types
  statusValue: z.string().optional(),
  specialAdCategories: z.array(z.string()).optional(),
  identityField: z.string().optional(),
  identityValues: z.string().optional(),
  spendingMin: z.number().optional(),
  spendingMax: z.number().optional(),
  pixelId: z.string().optional(),
  conversionEvent: z.string().optional(),
  trackingUrlPattern: z.string().optional(),
  // Step 4: Enforcement
  enforcement: z.nativeEnum(EnforcementMode),
  message: z.string().min(1, 'Message is required'),
  category: z.string().min(1, 'Category is required'),
  priority: z.number().int().min(0),
});

type RuleBuilderFormData = z.infer<typeof ruleBuilderSchema>;

const STEPS = ['Scope Selection', 'Platform & Entity', 'Rule Type & Condition', 'Enforcement', 'Preview'];

const ruleTypeLabels: Record<string, string> = {
  // Original 11 types
  [RuleType.NAMING_CONVENTION]: 'Naming Convention',
  [RuleType.BUDGET_ENFORCEMENT]: 'Budget Enforcement',
  [RuleType.TARGETING_CONSTRAINT]: 'Targeting Constraint',
  [RuleType.PLACEMENT_ENFORCEMENT]: 'Placement Enforcement',
  [RuleType.BRAND_SAFETY]: 'Brand Safety',
  [RuleType.TAXONOMY_COMPLIANCE]: 'Taxonomy Compliance',
  [RuleType.BIDDING_STRATEGY]: 'Bidding Strategy',
  [RuleType.SCHEDULE_ENFORCEMENT]: 'Schedule Enforcement',
  [RuleType.TRACKING_VALIDATION]: 'Tracking Validation',
  [RuleType.CREATIVE_VALIDATION]: 'Creative Validation',
  [RuleType.CUSTOM_FIELD]: 'Custom Field',
  // 19 new types
  [RuleType.SPENDING_LIMIT]: 'Spending Limit',
  [RuleType.SPECIAL_AD_CATEGORIES]: 'Special Ad Categories',
  [RuleType.PIXEL_CONVERSION]: 'Pixel / Conversion',
  [RuleType.BID_VALUE]: 'Bid Value',
  [RuleType.FREQUENCY_CAP]: 'Frequency Cap',
  [RuleType.TRACKING_URL]: 'Tracking URL',
  [RuleType.STATUS_ENFORCEMENT]: 'Status Enforcement',
  [RuleType.IDENTITY_ENFORCEMENT]: 'Identity Enforcement',
  [RuleType.INVENTORY_FILTER]: 'Inventory Filter',
  [RuleType.PERFORMANCE_GOAL]: 'Performance Goal',
  [RuleType.BILLING_EVENT]: 'Billing Event',
  [RuleType.AUDIENCE_CONTROL]: 'Audience Control',
  [RuleType.PLACEMENT_CONTROL]: 'Placement Control',
  [RuleType.DURATION_ENFORCEMENT]: 'Duration Enforcement',
  [RuleType.EU_COMPLIANCE]: 'EU Compliance',
  [RuleType.DAY_SCHEDULING]: 'Day Scheduling',
  [RuleType.CREATIVE_SPECS]: 'Creative Specs',
  [RuleType.CONFIRMATION]: 'Confirmation',
  [RuleType.MEDIA_PLAN]: 'Media Plan',
};

/** Grouped rule types for the Select dropdown */
const ruleTypeGroups: Array<{ label: string; types: RuleType[] }> = [
  {
    label: 'Naming & Taxonomy',
    types: [RuleType.NAMING_CONVENTION, RuleType.TAXONOMY_COMPLIANCE],
  },
  {
    label: 'Budget & Spending',
    types: [
      RuleType.BUDGET_ENFORCEMENT,
      RuleType.SPENDING_LIMIT,
      RuleType.BID_VALUE,
      RuleType.BIDDING_STRATEGY,
      RuleType.BILLING_EVENT,
      RuleType.PERFORMANCE_GOAL,
      RuleType.CONFIRMATION,
    ],
  },
  {
    label: 'Targeting & Audience',
    types: [
      RuleType.TARGETING_CONSTRAINT,
      RuleType.AUDIENCE_CONTROL,
      RuleType.FREQUENCY_CAP,
      RuleType.BRAND_SAFETY,
      RuleType.INVENTORY_FILTER,
    ],
  },
  {
    label: 'Placement & Delivery',
    types: [RuleType.PLACEMENT_ENFORCEMENT, RuleType.PLACEMENT_CONTROL],
  },
  {
    label: 'Schedule & Dates',
    types: [RuleType.SCHEDULE_ENFORCEMENT, RuleType.DURATION_ENFORCEMENT, RuleType.DAY_SCHEDULING],
  },
  {
    label: 'Campaign Settings',
    types: [
      RuleType.STATUS_ENFORCEMENT,
      RuleType.SPECIAL_AD_CATEGORIES,
      RuleType.IDENTITY_ENFORCEMENT,
      RuleType.EU_COMPLIANCE,
      RuleType.MEDIA_PLAN,
    ],
  },
  {
    label: 'Tracking & Conversion',
    types: [
      RuleType.TRACKING_VALIDATION,
      RuleType.TRACKING_URL,
      RuleType.PIXEL_CONVERSION,
    ],
  },
  {
    label: 'Creative & Ad',
    types: [RuleType.CREATIVE_VALIDATION, RuleType.CREATIVE_SPECS],
  },
  {
    label: 'Other',
    types: [RuleType.CUSTOM_FIELD],
  },
];

const brandSafetyOptions = [
  'Sexual',
  'Weapons',
  'Gambling',
  'Alcohol',
  'Tobacco',
  'Politics',
  'Religion',
  'Violence',
  'Drugs',
  'Profanity',
];

/**
 * Rule Builder - multi-step form for creating/editing governance rules
 */
export function RuleBuilder(): React.ReactElement {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [currentStep, setCurrentStep] = useState(0);
  const { data: existingRule, isLoading: ruleLoading, isError: ruleError } = useRuleById(id ?? '');
  const { data: accounts } = useAccounts();
  const { data: teams } = useTeams();
  const { data: buyers } = useUsers('buyer');
  const { data: ruleSets } = useRuleSets();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();

  /** Auto-select the first available rule set as default */
  const defaultRuleSetId = ruleSets && ruleSets.length > 0 ? ruleSets[0].id : '';

  const form = useForm<RuleBuilderFormData>({
    resolver: zodResolver(ruleBuilderSchema),
    defaultValues: {
      name: '',
      description: '',
      ruleSetId: '',
      accountIds: [],
      teamIds: [],
      buyerIds: [],
      allAccounts: false,
      allTeams: false,
      allBuyers: false,
      platforms: [Platform.META],
      entityLevels: [EntityLevel.CAMPAIGN],
      ruleType: RuleType.NAMING_CONVENTION,
      conditionOperator: RuleOperator.MATCHES_TEMPLATE,
      conditionField: '',
      conditionValue: '',
      enforcement: EnforcementMode.WARNING,
      message: '',
      category: '',
      priority: 0,
      requireConfirmation: false,
      brandSafetyCategories: [],
    },
    values: existingRule
      ? {
          name: existingRule.name,
          description: existingRule.description,
          ruleSetId: existingRule.ruleSetId,
          accountIds: existingRule.scope?.accountIds ?? [],
          teamIds: existingRule.scope?.teamIds ?? [],
          buyerIds: existingRule.scope?.buyerIds ?? [],
          allAccounts: (existingRule.scope?.accountIds ?? []).length === 0,
          allTeams: (existingRule.scope?.teamIds ?? []).length === 0,
          allBuyers: (existingRule.scope?.buyerIds ?? []).length === 0,
          platforms: existingRule.scope?.platforms ?? [Platform.META],
          entityLevels: existingRule.scope?.entityLevels ?? [EntityLevel.CAMPAIGN],
          ruleType: existingRule.ruleType,
          conditionOperator: existingRule.condition?.operator ?? RuleOperator.EQUALS,
          conditionField: existingRule.condition?.field ?? '',
          conditionValue: typeof existingRule.condition?.value === 'string'
            ? existingRule.condition.value
            : JSON.stringify(existingRule.condition?.value ?? ''),
          enforcement: existingRule.enforcement,
          message: existingRule.ui?.message ?? '',
          category: existingRule.ui?.category ?? '',
          priority: existingRule.ui?.priority ?? 0,
          requireConfirmation: existingRule.ui?.requireConfirmation ?? false,
          brandSafetyCategories: [],
        }
      : undefined,
  });

  /** Auto-populate ruleSetId when rule sets load (create mode only) */
  React.useEffect(() => {
    if (!isEditMode && defaultRuleSetId && !form.getValues('ruleSetId')) {
      form.setValue('ruleSetId', defaultRuleSetId);
    }
  }, [defaultRuleSetId, isEditMode, form]);

  /** Reset form when existing rule data loads (edit mode) to fix controlled Select pre-selection */
  React.useEffect(() => {
    if (isEditMode && existingRule) {
      form.reset({
        name: existingRule.name,
        description: existingRule.description,
        ruleSetId: existingRule.ruleSetId,
        accountIds: existingRule.scope?.accountIds ?? [],
        teamIds: existingRule.scope?.teamIds ?? [],
        buyerIds: existingRule.scope?.buyerIds ?? [],
        allAccounts: (existingRule.scope?.accountIds ?? []).length === 0,
        allTeams: (existingRule.scope?.teamIds ?? []).length === 0,
        allBuyers: (existingRule.scope?.buyerIds ?? []).length === 0,
        platforms: existingRule.scope?.platforms ?? [Platform.META],
        entityLevels: existingRule.scope?.entityLevels ?? [EntityLevel.CAMPAIGN],
        ruleType: existingRule.ruleType,
        conditionOperator: existingRule.condition?.operator ?? RuleOperator.EQUALS,
        conditionField: existingRule.condition?.field ?? '',
        conditionValue: typeof existingRule.condition?.value === 'string'
          ? existingRule.condition.value
          : JSON.stringify(existingRule.condition?.value ?? ''),
        enforcement: existingRule.enforcement,
        message: existingRule.ui?.message ?? '',
        category: existingRule.ui?.category ?? '',
        priority: existingRule.ui?.priority ?? 0,
        requireConfirmation: existingRule.ui?.requireConfirmation ?? false,
        brandSafetyCategories: [],
      });
    }
  }, [isEditMode, existingRule, form]);

  const goNext = useCallback(async () => {
    const fieldsPerStep: Record<number, (keyof RuleBuilderFormData)[]> = {
      0: ['name', 'description', 'ruleSetId'],
      1: ['platforms', 'entityLevels'],
      2: ['ruleType'],
      3: ['enforcement', 'message', 'category'],
    };
    const fields = fieldsPerStep[currentStep];
    if (fields) {
      const valid = await form.trigger(fields);
      if (!valid) {
        toast.error('Please fill in all required fields before continuing.');
        return;
      }
    }
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [currentStep, form]);

  const goBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  /**
   * Submit the rule.
   * Transforms the form data into the flat DTO format the backend expects.
   */
  const onSubmit = async (data: RuleBuilderFormData): Promise<void> => {
    const basePayload = {
      name: data.name,
      description: data.description,
      platform: data.platforms.length === 1 ? data.platforms[0] : Platform.ALL,
      entityLevel: data.entityLevels[0] ?? EntityLevel.CAMPAIGN,
      ruleType: data.ruleType,
      enforcement: data.enforcement,
      condition: {
        operator: data.conditionOperator,
        field: data.conditionField || undefined,
        value: data.conditionValue || undefined,
      },
      uiConfig: {
        injectionPoint: data.ruleType === RuleType.NAMING_CONVENTION ? 'name_field' : 'auto',
        message: data.message,
        style: data.enforcement === EnforcementMode.BLOCKING ? 'error_banner' : 'warning_banner',
        category: data.category,
        priority: data.priority,
        requireConfirmation: data.requireConfirmation,
      },
      priority: data.priority,
      enabled: true,
    };

    try {
      if (isEditMode && id) {
        // Update: don't send ruleSetId (can't change rule set after creation)
        await updateRule.mutateAsync({ id, ...basePayload });
        toast.success('Rule updated successfully');
      } else {
        // Create: include ruleSetId
        await createRule.mutateAsync({ ruleSetId: data.ruleSetId, ...basePayload });
        toast.success('Rule created successfully');
      }
      navigate('/rules');
    } catch (error) {
      console.error('Failed to save rule:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save rule. Please try again.';
      toast.error(errorMessage);
    }
  };

  /** Show loading state while fetching rule for edit mode */
  if (isEditMode && ruleLoading) {
    return (
      <div className="flex items-center justify-center py-24" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">Loading rule...</span>
      </div>
    );
  }

  /** Show error state if rule fetch failed in edit mode */
  if (isEditMode && ruleError) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Rule</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <p className="text-destructive">Failed to load rule. It may have been deleted.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/rules')}>
              Back to Rules
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{isEditMode ? 'Edit Rule' : 'Create Rule'}</h1>
        <p className="mt-1 text-muted-foreground">
          {isEditMode ? 'Modify an existing governance rule.' : 'Define a new governance rule step by step.'}
        </p>
      </div>

      {/* Name and description (always visible) */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Rule Name</Label>
              <Input
                id="name"
                placeholder="e.g., Must target USA"
                {...form.register('name')}
                aria-invalid={!!form.formState.errors.name}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="e.g., All ad sets must target the United States"
                {...form.register('description')}
                aria-invalid={!!form.formState.errors.description}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step indicator */}
      <div className="flex items-center gap-2" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
        {STEPS.map((step, idx) => (
          <React.Fragment key={step}>
            <button
              type="button"
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium transition-colors',
                idx === currentStep
                  ? 'bg-primary text-primary-foreground'
                  : idx < currentStep
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
              )}
              onClick={() => setCurrentStep(idx)}
              aria-label={`Step ${idx + 1}: ${step}`}
            >
              {idx < currentStep ? (
                <Check className="h-3 w-3" />
              ) : (
                <span className="text-xs">{idx + 1}</span>
              )}
              <span className="hidden sm:inline">{step}</span>
            </button>
            {idx < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
          console.error('Rule Builder validation errors:', errors);
          const firstError = Object.values(errors)[0];
          if (firstError && 'message' in firstError) {
            toast.error(String(firstError.message));
          } else {
            toast.error('Please fill in all required fields before saving.');
          }
        })}>
        {currentStep === 0 && <ScopeStep form={form} accounts={accounts ?? []} teams={teams ?? []} buyers={buyers ?? []} ruleSets={ruleSets ?? []} />}
        {currentStep === 1 && <PlatformEntityStep form={form} />}
        {currentStep === 2 && <RuleTypeConditionStep form={form} />}
        {currentStep === 3 && <EnforcementStep form={form} />}
        {currentStep === 4 && <PreviewStep form={form} />}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {currentStep < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext} className="gap-2">
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={createRule.isPending || updateRule.isPending}
              className="gap-2"
            >
              {(createRule.isPending || updateRule.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isEditMode ? 'Update Rule' : 'Save Rule'}
            </Button>
          )}
        </div>
      </form>
      {/* Version History - only shown in edit mode */}
      {isEditMode && id && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Version History</CardTitle>
            </div>
            <CardDescription>
              View changes made to this rule over time and restore previous versions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RuleVersionHistory ruleId={id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================
// Step Components
// =====================================================

interface StepProps {
  form: UseFormReturn<RuleBuilderFormData>;
}

interface ScopeStepProps extends StepProps {
  accounts: Array<{ id: string; accountName: string }>;
  teams: Array<{ id: string; name: string }>;
  buyers: Array<{ id: string; name: string; email: string }>;
  ruleSets: Array<{ id: string; name: string }>;
}

function ScopeStep({ form, accounts, teams, buyers, ruleSets }: ScopeStepProps): React.ReactElement {
  const watchAllAccounts = form.watch('allAccounts');
  const watchAllTeams = form.watch('allTeams');
  const watchAllBuyers = form.watch('allBuyers');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scope Selection</CardTitle>
        <CardDescription>
          Choose which accounts, teams, and buyers this rule applies to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Rule Set selector */}
        <div className="space-y-2">
          <Label htmlFor="ruleSetId">Rule Set</Label>
          <Controller
            name="ruleSetId"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="ruleSetId">
                  <SelectValue placeholder="Select a rule set" />
                </SelectTrigger>
                <SelectContent>
                  {ruleSets.map((rs) => (
                    <SelectItem key={rs.id} value={rs.id}>
                      {rs.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.ruleSetId && (
            <p className="text-sm text-destructive">{form.formState.errors.ruleSetId.message}</p>
          )}
          {ruleSets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rule sets available.{' '}
              <Link
                to="/rule-sets"
                className="inline-flex items-center text-sm text-primary hover:underline"
              >
                Create one now <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </p>
          ) : (
            form.watch('ruleSetId') && (
              <Link
                to="/rule-sets"
                className="inline-flex items-center text-sm text-primary hover:underline"
              >
                Manage Rule Sets <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            )
          )}
        </div>

        <Separator />

        {/* Accounts */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Controller
              name="allAccounts"
              control={form.control}
              render={({ field }) => (
                <Checkbox
                  id="allAccounts"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Select all accounts"
                />
              )}
            />
            <Label htmlFor="allAccounts">All Accounts</Label>
          </div>
          {!watchAllAccounts && (
            <div className="ml-6 space-y-2">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center gap-2">
                  <Controller
                    name="accountIds"
                    control={form.control}
                    render={({ field }) => (
                      <Checkbox
                        id={`account-${account.id}`}
                        checked={field.value.includes(account.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            field.onChange([...field.value, account.id]);
                          } else {
                            field.onChange(field.value.filter((id: string) => id !== account.id));
                          }
                        }}
                      />
                    )}
                  />
                  <Label htmlFor={`account-${account.id}`}>{account.accountName}</Label>
                </div>
              ))}
              {accounts.length === 0 && (
                <p className="text-sm text-muted-foreground">No accounts available.</p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Teams */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Controller
              name="allTeams"
              control={form.control}
              render={({ field }) => (
                <Checkbox
                  id="allTeams"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Select all teams"
                />
              )}
            />
            <Label htmlFor="allTeams">All Teams</Label>
          </div>
          {!watchAllTeams && (
            <div className="ml-6 space-y-2">
              {teams.map((team) => (
                <div key={team.id} className="flex items-center gap-2">
                  <Controller
                    name="teamIds"
                    control={form.control}
                    render={({ field }) => (
                      <Checkbox
                        id={`team-${team.id}`}
                        checked={field.value.includes(team.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            field.onChange([...field.value, team.id]);
                          } else {
                            field.onChange(field.value.filter((id: string) => id !== team.id));
                          }
                        }}
                      />
                    )}
                  />
                  <Label htmlFor={`team-${team.id}`}>{team.name}</Label>
                </div>
              ))}
              {teams.length === 0 && (
                <p className="text-sm text-muted-foreground">No teams available.</p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Buyers */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Controller
              name="allBuyers"
              control={form.control}
              render={({ field }) => (
                <Checkbox
                  id="allBuyers"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Select all buyers"
                />
              )}
            />
            <Label htmlFor="allBuyers">All Buyers</Label>
          </div>
          {!watchAllBuyers && (
            <div className="ml-6 space-y-2">
              {buyers.map((buyer) => (
                <div key={buyer.id} className="flex items-center gap-2">
                  <Controller
                    name="buyerIds"
                    control={form.control}
                    render={({ field }) => (
                      <Checkbox
                        id={`buyer-${buyer.id}`}
                        checked={field.value.includes(buyer.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            field.onChange([...field.value, buyer.id]);
                          } else {
                            field.onChange(field.value.filter((id: string) => id !== buyer.id));
                          }
                        }}
                      />
                    )}
                  />
                  <Label htmlFor={`buyer-${buyer.id}`}>
                    {buyer.name} <span className="text-muted-foreground">({buyer.email})</span>
                  </Label>
                </div>
              ))}
              {buyers.length === 0 && (
                <p className="text-sm text-muted-foreground">No buyers available.</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PlatformEntityStep({ form }: StepProps): React.ReactElement {
  const platformOptions = [
    { value: Platform.META, label: 'Meta (Facebook/Instagram)' },
    { value: Platform.GOOGLE_ADS, label: 'Google Ads' },
    { value: Platform.ALL, label: 'Both Platforms' },
  ];

  const entityOptions = [
    { value: EntityLevel.CAMPAIGN, label: 'Campaign' },
    { value: EntityLevel.AD_SET, label: 'Ad Set / Ad Group' },
    { value: EntityLevel.AD, label: 'Ad / Creative' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform & Entity Level</CardTitle>
        <CardDescription>
          Select which platform and entity level this rule applies to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Platform</Label>
          <div className="space-y-2">
            {platformOptions.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <Controller
                  name="platforms"
                  control={form.control}
                  render={({ field }) => (
                    <Checkbox
                      id={`platform-${opt.value}`}
                      checked={field.value.includes(opt.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          field.onChange([...field.value, opt.value]);
                        } else {
                          field.onChange(field.value.filter((v: Platform) => v !== opt.value));
                        }
                      }}
                    />
                  )}
                />
                <Label htmlFor={`platform-${opt.value}`}>{opt.label}</Label>
              </div>
            ))}
          </div>
          {form.formState.errors.platforms && (
            <p className="text-sm text-destructive">{form.formState.errors.platforms.message}</p>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <Label>Entity Level</Label>
          <div className="space-y-2">
            {entityOptions.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <Controller
                  name="entityLevels"
                  control={form.control}
                  render={({ field }) => (
                    <Checkbox
                      id={`entity-${opt.value}`}
                      checked={field.value.includes(opt.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          field.onChange([...field.value, opt.value]);
                        } else {
                          field.onChange(field.value.filter((v: EntityLevel) => v !== opt.value));
                        }
                      }}
                    />
                  )}
                />
                <Label htmlFor={`entity-${opt.value}`}>{opt.label}</Label>
              </div>
            ))}
          </div>
          {form.formState.errors.entityLevels && (
            <p className="text-sm text-destructive">{form.formState.errors.entityLevels.message}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RuleTypeConditionStep({ form }: StepProps): React.ReactElement {
  const watchRuleType = form.watch('ruleType');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rule Type & Condition</CardTitle>
        <CardDescription>
          Define what this rule checks and how it evaluates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="ruleType">Rule Type</Label>
          <Controller
            name="ruleType"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="ruleType">
                  <SelectValue placeholder="Select rule type" />
                </SelectTrigger>
                <SelectContent>
                  {ruleTypeGroups.map((group) => (
                    <SelectGroup key={group.label}>
                      <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group.label}</p>
                      {group.types.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ruleTypeLabels[type] ?? type}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <Separator />

        {/* Dynamic condition form based on rule type */}
        {watchRuleType === RuleType.NAMING_CONVENTION && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select or create a naming template. The rule will validate entity names against this template.
            </p>
            <div className="space-y-2">
              <Label htmlFor="namingTemplateId">Naming Template ID</Label>
              <Input
                id="namingTemplateId"
                placeholder="Template ID or create new"
                {...form.register('namingTemplateId')}
              />
            </div>
          </div>
        )}

        {watchRuleType === RuleType.BUDGET_ENFORCEMENT && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="budgetType">Budget Type</Label>
              <Controller
                name="budgetType"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="budgetType">
                      <SelectValue placeholder="Select budget type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily Budget</SelectItem>
                      <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="budgetMin">Minimum Budget</Label>
                <Input
                  id="budgetMin"
                  type="number"
                  placeholder="0"
                  {...form.register('budgetMin', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budgetMax">Maximum Budget</Label>
                <Input
                  id="budgetMax"
                  type="number"
                  placeholder="100000"
                  {...form.register('budgetMax', { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Controller
                name="requireConfirmation"
                control={form.control}
                render={({ field }) => (
                  <Checkbox
                    id="requireConfirmation"
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="requireConfirmation">Require budget re-confirmation</Label>
            </div>
          </div>
        )}

        {watchRuleType === RuleType.TARGETING_CONSTRAINT && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="targetingField">Targeting Field</Label>
              <Controller
                name="targetingField"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="targetingField">
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geo_locations.countries">Geographic Location</SelectItem>
                      <SelectItem value="genders">Gender</SelectItem>
                      <SelectItem value="age_range">Age Range</SelectItem>
                      <SelectItem value="languages">Language</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conditionOperator">Operator</Label>
              <Controller
                name="conditionOperator"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="conditionOperator">
                      <SelectValue placeholder="Select operator" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={RuleOperator.MUST_INCLUDE}>Must Include</SelectItem>
                      <SelectItem value={RuleOperator.MUST_EXCLUDE}>Must Exclude</SelectItem>
                      <SelectItem value={RuleOperator.MUST_ONLY_BE}>Must Only Be</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conditionValue">Value (comma-separated)</Label>
              <Input
                id="conditionValue"
                placeholder='e.g., US, FR, DE'
                {...form.register('conditionValue')}
              />
            </div>
          </div>
        )}

        {watchRuleType === RuleType.BRAND_SAFETY && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select sensitive categories that must be excluded.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {brandSafetyOptions.map((category) => (
                <div key={category} className="flex items-center gap-2">
                  <Controller
                    name="brandSafetyCategories"
                    control={form.control}
                    render={({ field }) => (
                      <Checkbox
                        id={`brand-${category}`}
                        checked={(field.value ?? []).includes(category)}
                        onCheckedChange={(checked) => {
                          const current = field.value ?? [];
                          if (checked) {
                            field.onChange([...current, category]);
                          } else {
                            field.onChange(current.filter((c: string) => c !== category));
                          }
                        }}
                      />
                    )}
                  />
                  <Label htmlFor={`brand-${category}`}>{category}</Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {watchRuleType === RuleType.CUSTOM_FIELD && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conditionField">Field Path</Label>
              <Input
                id="conditionField"
                placeholder='e.g., campaign.budget_type'
                {...form.register('conditionField')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conditionOperator">Operator</Label>
              <Controller
                name="conditionOperator"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="conditionOperator">
                      <SelectValue placeholder="Select operator" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(RuleOperator).map((op) => (
                        <SelectItem key={op} value={op}>
                          {op.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conditionValue">Value</Label>
              <Input
                id="conditionValue"
                placeholder="Expected value"
                {...form.register('conditionValue')}
              />
            </div>
          </div>
        )}

        {watchRuleType === RuleType.STATUS_ENFORCEMENT && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enforce a specific status when creating or editing entities.
            </p>
            <div className="space-y-2">
              <Label htmlFor="statusValue">Required Status</Label>
              <Controller
                name="statusValue"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="statusValue">
                      <SelectValue placeholder="Select required status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PAUSED">Paused</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="ARCHIVED">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        )}

        {watchRuleType === RuleType.SPECIAL_AD_CATEGORIES && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enforce special ad category declarations for regulated industries.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {['CREDIT', 'EMPLOYMENT', 'HOUSING', 'SOCIAL_ISSUES_ELECTIONS_POLITICS'].map((category) => (
                <div key={category} className="flex items-center gap-2">
                  <Controller
                    name="specialAdCategories"
                    control={form.control}
                    render={({ field }) => (
                      <Checkbox
                        id={`sac-${category}`}
                        checked={(field.value ?? []).includes(category)}
                        onCheckedChange={(checked) => {
                          const current = field.value ?? [];
                          if (checked) {
                            field.onChange([...current, category]);
                          } else {
                            field.onChange(current.filter((c: string) => c !== category));
                          }
                        }}
                      />
                    )}
                  />
                  <Label htmlFor={`sac-${category}`}>{category.replace(/_/g, ' ')}</Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {watchRuleType === RuleType.IDENTITY_ENFORCEMENT && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enforce identity settings (Facebook Page, Instagram Account).
            </p>
            <div className="space-y-2">
              <Label htmlFor="identityField">Identity Field</Label>
              <Controller
                name="identityField"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="identityField">
                      <SelectValue placeholder="Select identity field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ad.facebook_page_id">Facebook Page</SelectItem>
                      <SelectItem value="ad.instagram_account_id">Instagram Account</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="identityValues">Approved IDs (comma-separated, leave blank for any)</Label>
              <Input
                id="identityValues"
                placeholder="e.g., 123456789, 987654321"
                {...form.register('identityValues')}
              />
            </div>
          </div>
        )}

        {watchRuleType === RuleType.SPENDING_LIMIT && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Set minimum and/or maximum spending limits.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="spendingMin">Minimum Spend</Label>
                <Input
                  id="spendingMin"
                  type="number"
                  placeholder="0"
                  {...form.register('spendingMin', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="spendingMax">Maximum Spend</Label>
                <Input
                  id="spendingMax"
                  type="number"
                  placeholder="100000"
                  {...form.register('spendingMax', { valueAsNumber: true })}
                />
              </div>
            </div>
          </div>
        )}

        {watchRuleType === RuleType.PIXEL_CONVERSION && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enforce pixel and conversion event configuration.
            </p>
            <div className="space-y-2">
              <Label htmlFor="pixelId">Required Pixel ID (leave blank for any pixel)</Label>
              <Input
                id="pixelId"
                placeholder="e.g., 123456789"
                {...form.register('pixelId')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conversionEvent">Required Conversion Event</Label>
              <Controller
                name="conversionEvent"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="conversionEvent">
                      <SelectValue placeholder="Select conversion event (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Purchase">Purchase</SelectItem>
                      <SelectItem value="Lead">Lead</SelectItem>
                      <SelectItem value="AddToCart">Add to Cart</SelectItem>
                      <SelectItem value="CompleteRegistration">Complete Registration</SelectItem>
                      <SelectItem value="ViewContent">View Content</SelectItem>
                      <SelectItem value="InitiateCheckout">Initiate Checkout</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        )}

        {watchRuleType === RuleType.TRACKING_URL && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Validate destination URLs and tracking parameters.
            </p>
            <div className="space-y-2">
              <Label htmlFor="trackingUrlPattern">URL must contain (e.g., utm_ for UTM tracking)</Label>
              <Input
                id="trackingUrlPattern"
                placeholder="utm_"
                {...form.register('trackingUrlPattern')}
              />
            </div>
          </div>
        )}

        {/* Generic fallback for other rule types */}
        {![
          RuleType.NAMING_CONVENTION,
          RuleType.BUDGET_ENFORCEMENT,
          RuleType.TARGETING_CONSTRAINT,
          RuleType.BRAND_SAFETY,
          RuleType.CUSTOM_FIELD,
          RuleType.STATUS_ENFORCEMENT,
          RuleType.SPECIAL_AD_CATEGORIES,
          RuleType.IDENTITY_ENFORCEMENT,
          RuleType.SPENDING_LIMIT,
          RuleType.PIXEL_CONVERSION,
          RuleType.TRACKING_URL,
        ].includes(watchRuleType) && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conditionField">Field Path</Label>
              <Input
                id="conditionField"
                placeholder="Field to validate"
                {...form.register('conditionField')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conditionOperator">Operator</Label>
              <Controller
                name="conditionOperator"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="conditionOperator">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(RuleOperator).map((op) => (
                        <SelectItem key={op} value={op}>
                          {op.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conditionValue">Value</Label>
              <Input
                id="conditionValue"
                placeholder="Expected value"
                {...form.register('conditionValue')}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EnforcementStep({ form }: StepProps): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enforcement Mode</CardTitle>
        <CardDescription>
          Define how violations of this rule are handled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Enforcement Mode</Label>
          <Controller
            name="enforcement"
            control={form.control}
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={EnforcementMode.WARNING} id="warning" />
                  <div>
                    <Label htmlFor="warning" className="cursor-pointer font-medium">
                      Warning (Soft)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Shows an alert banner; buyer can proceed.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={EnforcementMode.BLOCKING} id="blocking" />
                  <div>
                    <Label htmlFor="blocking" className="cursor-pointer font-medium">
                      Blocking (Hard)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Prevents creation until the violation is resolved.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={EnforcementMode.COMMENT_REQUIRED} id="comment" />
                  <div>
                    <Label htmlFor="comment" className="cursor-pointer font-medium">
                      Comment Required
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Buyer must leave a justification before proceeding.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={EnforcementMode.SECOND_APPROVER} id="approver" />
                  <div>
                    <Label htmlFor="approver" className="cursor-pointer font-medium">
                      Second Approver
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      A designated approver must review before launch.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            )}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="message">Banner Message</Label>
          <Textarea
            id="message"
            placeholder='e.g., You must select only the following location: "United States"'
            {...form.register('message')}
            aria-invalid={!!form.formState.errors.message}
          />
          {form.formState.errors.message && (
            <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              placeholder='e.g., META - CAMPAIGN'
              {...form.register('category')}
              aria-invalid={!!form.formState.errors.category}
            />
            {form.formState.errors.category && (
              <p className="text-sm text-destructive">{form.formState.errors.category.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              type="number"
              min={0}
              placeholder="0"
              {...form.register('priority', { valueAsNumber: true })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewStep({ form }: StepProps): React.ReactElement {
  const values = form.getValues();

  const rulePreview = {
    name: values.name,
    description: values.description,
    scope: {
      platforms: values.platforms,
      entityLevels: values.entityLevels,
      accountIds: values.allAccounts ? '(all)' : values.accountIds,
      teamIds: values.allTeams ? '(all)' : values.teamIds,
      buyerIds: values.allBuyers ? '(all)' : values.buyerIds,
    },
    ruleType: values.ruleType,
    enforcement: values.enforcement,
    condition: {
      operator: values.conditionOperator,
      field: values.conditionField,
      value: values.conditionValue,
    },
    ui: {
      message: values.message,
      category: values.category,
      priority: values.priority,
    },
  };

  return (
    <div className="space-y-6">
      {/* UI Mockup */}
      <Card>
        <CardHeader>
          <CardTitle>Rule Preview</CardTitle>
          <CardDescription>How this rule will appear to media buyers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              'rounded-lg border-2 p-4',
              values.enforcement === EnforcementMode.BLOCKING
                ? 'border-red-300 bg-red-50'
                : values.enforcement === EnforcementMode.WARNING
                  ? 'border-yellow-300 bg-yellow-50'
                  : 'border-blue-300 bg-blue-50'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 rounded-full p-1',
                  values.enforcement === EnforcementMode.BLOCKING
                    ? 'bg-red-200'
                    : values.enforcement === EnforcementMode.WARNING
                      ? 'bg-yellow-200'
                      : 'bg-blue-200'
                )}
              >
                <Badge
                  variant={
                    values.enforcement === EnforcementMode.BLOCKING
                      ? 'destructive'
                      : values.enforcement === EnforcementMode.WARNING
                        ? 'warning'
                        : 'default'
                  }
                  className="text-xs"
                >
                  {values.enforcement.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              <div>
                <p className="font-medium">{values.name || 'Rule Name'}</p>
                <p className="mt-1 text-sm">{values.message || 'Rule message will appear here.'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* JSON Preview */}
      <Card>
        <CardHeader>
          <CardTitle>JSON Preview</CardTitle>
          <CardDescription>The rule object that will be sent to the API.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-sm">
            {JSON.stringify(rulePreview, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
