import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type {
  Rule,
  AdAccount,
  Team,
  User,
  RuleSet,
  NamingTemplate,
  ComplianceEvent,
  Organization,
  ApprovalRequest,
} from '@media-buying-governance/shared';
import type {
  GetComplianceDashboardResponse,
} from '@media-buying-governance/shared';

/**
 * Payload shape for creating/updating rules.
 * Matches the backend CreateRuleDto flat structure (not the nested shared Rule type).
 */
export interface CreateRulePayload {
  ruleSetId: string;
  name: string;
  description?: string;
  platform?: string;
  entityLevel: string;
  ruleType: string;
  enforcement?: string;
  condition: Record<string, unknown>;
  uiConfig?: Record<string, unknown>;
  priority?: number;
  enabled?: boolean;
}

export type UpdateRulePayload = Partial<CreateRulePayload>;

/**
 * Response from the extension pairing endpoint.
 */
export interface PairExtensionResult {
  extension_token: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

/** Query key factory for consistent cache key management */
const queryKeys = {
  accounts: ['accounts'] as const,
  organizations: ['organizations'] as const,
  teams: ['teams'] as const,
  users: (role?: string) => ['users', { role }] as const,
  rules: ['rules'] as const,
  ruleById: (id: string) => ['rules', id] as const,
  ruleSets: ['rule-sets'] as const,
  namingTemplates: ['naming-templates'] as const,
  namingTemplateById: (id: string) => ['naming-templates', id] as const,
  complianceDashboard: (dateRange?: string) => ['compliance', 'dashboard', { dateRange }] as const,
  complianceEvents: (params?: Record<string, string>) =>
    ['compliance', 'events', params] as const,
  extensionToken: ['extension', 'token'] as const,
  approvalRequests: (status?: string) => ['approval-requests', { status }] as const,
  approvalRequestById: (id: string) => ['approval-requests', id] as const,
};

// =====================
// Organizations
// =====================

/** Fetch all organizations (super admin only) */
export function useOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: async (): Promise<Organization[]> => {
      const { data } = await apiClient.get<Organization[]>('/admin/organizations');
      return data;
    },
  });
}

/** Create a new organization */
export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (org: Omit<Organization, 'id' | 'createdAt'>) => {
      const { data } = await apiClient.post<Organization>('/admin/organizations', org);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.organizations });
    },
  });
}

/** Update an organization */
export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...org }: Partial<Organization> & { id: string }) => {
      const { data } = await apiClient.put<Organization>(`/admin/organizations/${id}`, org);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.organizations });
    },
  });
}

/** Delete an organization */
export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/organizations/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.organizations });
    },
  });
}

// =====================
// Accounts
// =====================

/** Fetch all ad accounts */
export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: async (): Promise<AdAccount[]> => {
      const { data } = await apiClient.get<AdAccount[]>('/admin/accounts');
      return data;
    },
  });
}

/** Create a new ad account */
export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (account: Omit<AdAccount, 'id' | 'organizationId'>) => {
      const { data } = await apiClient.post<AdAccount>('/admin/accounts', account);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });
}

/** Update an ad account */
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...account }: Partial<AdAccount> & { id: string }) => {
      const { data } = await apiClient.put<AdAccount>(`/admin/accounts/${id}`, account);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });
}

/** Delete an ad account */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/accounts/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });
}

// =====================
// Teams
// =====================

/** Fetch all teams */
export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams,
    queryFn: async (): Promise<Team[]> => {
      const { data } = await apiClient.get<Team[]>('/admin/teams');
      return data;
    },
  });
}

/** Create a new team */
export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (team: Omit<Team, 'id' | 'organizationId'>) => {
      const { data } = await apiClient.post<Team>('/admin/teams', team);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.teams });
    },
  });
}

/** Update a team */
export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...team }: Partial<Team> & { id: string }) => {
      const { data } = await apiClient.put<Team>(`/admin/teams/${id}`, team);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.teams });
    },
  });
}

/** Delete a team */
export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/teams/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.teams });
    },
  });
}

// =====================
// Users
// =====================

/** Fetch users, optionally filtered by role */
export function useUsers(role?: string) {
  return useQuery({
    queryKey: queryKeys.users(role),
    queryFn: async (): Promise<User[]> => {
      const params = role ? { role } : {};
      const { data } = await apiClient.get<User[]>('/admin/users', { params });
      return data;
    },
  });
}

/** Create a new user */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (user: Omit<User, 'id' | 'organizationId'>) => {
      const { data } = await apiClient.post<User>('/admin/users', user);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.users() });
    },
  });
}

/** Update a user */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...user }: Partial<User> & { id: string }) => {
      const { data } = await apiClient.put<User>(`/admin/users/${id}`, user);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.users() });
    },
  });
}

/** Delete a user */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/users/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.users() });
    },
  });
}

// =====================
// Rules
// =====================

/** Fetch all rules */
export function useRules() {
  return useQuery({
    queryKey: queryKeys.rules,
    queryFn: async (): Promise<Rule[]> => {
      const { data } = await apiClient.get<Rule[]>('/admin/rules');
      return data;
    },
  });
}

/** Fetch a single rule by ID */
export function useRuleById(id: string) {
  return useQuery({
    queryKey: queryKeys.ruleById(id),
    queryFn: async (): Promise<Rule> => {
      const { data } = await apiClient.get<Rule>(`/admin/rules/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new rule.
 * Sends the flat CreateRuleDto format that the backend expects.
 */
export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: CreateRulePayload) => {
      const { data } = await apiClient.post<Rule>('/admin/rules', rule);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.rules });
    },
  });
}

/**
 * Update an existing rule.
 * Sends the flat UpdateRuleDto format that the backend expects.
 */
export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rule }: UpdateRulePayload & { id: string }) => {
      const { data } = await apiClient.put<Rule>(`/admin/rules/${id}`, rule);
      return data;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.rules });
      void qc.invalidateQueries({ queryKey: queryKeys.ruleById(variables.id) });
    },
  });
}

/** Delete a rule */
export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/rules/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.rules });
    },
  });
}

// =====================
// Naming Templates
// =====================

/** Fetch all naming templates */
export function useNamingTemplates() {
  return useQuery({
    queryKey: queryKeys.namingTemplates,
    queryFn: async (): Promise<NamingTemplate[]> => {
      const { data } = await apiClient.get<NamingTemplate[]>('/admin/naming-templates');
      return data;
    },
  });
}

/** Fetch a single naming template by ID */
export function useNamingTemplateById(id: string) {
  return useQuery({
    queryKey: queryKeys.namingTemplateById(id),
    queryFn: async (): Promise<NamingTemplate> => {
      const { data } = await apiClient.get<NamingTemplate>(`/admin/naming-templates/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/** Create a new naming template */
export function useCreateNamingTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Omit<NamingTemplate, 'id'>) => {
      const { data } = await apiClient.post<NamingTemplate>('/admin/naming-templates', template);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.namingTemplates });
    },
  });
}

/** Update a naming template */
export function useUpdateNamingTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...template }: Partial<NamingTemplate> & { id: string }) => {
      const { data } = await apiClient.put<NamingTemplate>(
        `/admin/naming-templates/${id}`,
        template
      );
      return data;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.namingTemplates });
      void qc.invalidateQueries({ queryKey: queryKeys.namingTemplateById(variables.id) });
    },
  });
}

/** Delete a naming template */
export function useDeleteNamingTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/naming-templates/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.namingTemplates });
    },
  });
}

// =====================
// Compliance
// =====================

/** Fetch compliance dashboard data */
export function useComplianceDashboard(dateRange?: string) {
  return useQuery({
    queryKey: queryKeys.complianceDashboard(dateRange),
    queryFn: async (): Promise<GetComplianceDashboardResponse> => {
      const params = dateRange ? { date_range: dateRange } : {};
      const { data } = await apiClient.get<GetComplianceDashboardResponse>(
        '/admin/compliance/dashboard',
        { params }
      );
      return data;
    },
  });
}

/** Fetch compliance events */
export function useComplianceEvents(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.complianceEvents(params),
    queryFn: async (): Promise<{ events: ComplianceEvent[]; total: number }> => {
      const { data } = await apiClient.get<{ events: ComplianceEvent[]; total: number }>(
        '/admin/compliance/events',
        { params }
      );
      return data;
    },
  });
}

// =====================
// Rule Sets
// =====================

/** Fetch all rule sets */
export function useRuleSets() {
  return useQuery({
    queryKey: queryKeys.ruleSets,
    queryFn: async (): Promise<RuleSet[]> => {
      const { data } = await apiClient.get<RuleSet[]>('/admin/rule-sets');
      return data;
    },
  });
}

/** Fetch a single rule set by ID */
export function useRuleSetById(id: string) {
  return useQuery({
    queryKey: ['rule-sets', id],
    queryFn: async (): Promise<RuleSet> => {
      const { data } = await apiClient.get<RuleSet>(`/admin/rule-sets/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/** Create a new rule set */
export function useCreateRuleSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleSet: Omit<RuleSet, 'id' | 'organizationId' | 'version'>) => {
      const { data } = await apiClient.post<RuleSet>('/admin/rule-sets', ruleSet);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.ruleSets });
    },
  });
}

/** Update a rule set */
export function useUpdateRuleSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...ruleSet }: Partial<RuleSet> & { id: string }) => {
      const { data } = await apiClient.put<RuleSet>(`/admin/rule-sets/${id}`, ruleSet);
      return data;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.ruleSets });
      void qc.invalidateQueries({ queryKey: ['rule-sets', variables.id] });
    },
  });
}

/** Delete a rule set */
export function useDeleteRuleSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/rule-sets/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.ruleSets });
    },
  });
}

// =====================
// Extension Pairing
// =====================

/** Pair an extension by email (generates or returns existing token) */
export function usePairExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      email?: string;
      org_slug?: string;
      invite_code?: string;
    }): Promise<PairExtensionResult> => {
      const { data } = await apiClient.post<PairExtensionResult>(
        '/extension/pair',
        params
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.extensionToken });
    },
  });
}

// =====================
// Approval Requests
// =====================

/** Fetch approval requests for current user (approver) */
export function useApprovalRequests(status?: 'pending' | 'approved' | 'rejected') {
  return useQuery({
    queryKey: queryKeys.approvalRequests(status),
    queryFn: async (): Promise<ApprovalRequest[]> => {
      const params = status ? { status } : {};
      const { data } = await apiClient.get<ApprovalRequest[]>('/admin/approval/requests', { params });
      return data;
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });
}

/** Fetch single approval request by ID */
export function useApprovalRequestById(id: string) {
  return useQuery({
    queryKey: queryKeys.approvalRequestById(id),
    queryFn: async (): Promise<ApprovalRequest> => {
      const { data } = await apiClient.get<ApprovalRequest>(`/admin/approval/requests/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/** Approve an approval request */
export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) => {
      const { data } = await apiClient.put<ApprovalRequest>(
        `/admin/approval/requests/${id}`,
        { status: 'approved', comment }
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval-requests'] });
    },
  });
}

/** Reject an approval request */
export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment: string }) => {
      const { data } = await apiClient.put<ApprovalRequest>(
        `/admin/approval/requests/${id}`,
        { status: 'rejected', comment }
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval-requests'] });
    },
  });
}
