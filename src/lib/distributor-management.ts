import { supabase } from "@/integrations/supabase/client";

export interface DashboardStats {
  total_customers: number;
  total_outstanding_debt: number;
  total_balance: number;
  pending_topup_requests: number;
  today_transactions: number;
}

export interface CustomerWithProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  distributor_id: string | null;
  notes: string | null;
  customer_status: string;
  current_balance?: number;
  current_debt?: number;
  total_topups?: number;
  total_payments?: number;
  last_topup?: string | null;
  last_payment?: string | null;
}

export interface CustomerTransaction {
  id: string;
  customer_id: string;
  distributor_id: string | null;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  debt_before: number;
  debt_after: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TopupRequest {
  id: string;
  customer_id: string;
  distributor_id: string;
  operator: string;
  amount: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  customer_display_name?: string | null;
  customer_email?: string | null;
}

interface RpcResult {
  ok: boolean;
  reason?: string;
}

function parseRpcResult(data: unknown): { success: boolean; error?: string } {
  if (!data || typeof data !== "object") return { success: true };
  const result = data as RpcResult;
  if (!result.ok) return { success: false, error: result.reason || "Operation failed" };
  return { success: true };
}

async function rpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc(fn as never, args as never);
    if (error) return { data: null, error: error.message };
    return { data: data as T, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "RPC failed" };
  }
}

export async function getDistributorDashboardStats(): Promise<DashboardStats | null> {
  const { data, error } = await rpc<DashboardStats>("distributor_get_dashboard_stats");
  if (error) return null;
  return data;
}

export async function getAdminDistributorStats(distributorUserId: string): Promise<DashboardStats | null> {
  const { data, error } = await rpc<DashboardStats>("admin_get_distributor_stats", {
    _distributor_user_id: distributorUserId,
  });
  if (error) return null;
  return data;
}

export async function getDistributorCustomers(distributorUserId?: string): Promise<CustomerWithProfile[]> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  let targetDistributorId = distributorUserId;
  if (!targetDistributorId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("distributor_id")
      .eq("user_id", user.id)
      .maybeSingle();
    targetDistributorId = profile?.distributor_id || null;
  }

  if (!targetDistributorId) return [];

  const { data: assignments, error: assignError } = await supabase
    .from("distributor_customers")
    .select("customer_id, assigned_at, assigned_by")
    .eq("distributor_id", targetDistributorId)
    .order("assigned_at", { ascending: false });

  if (assignError || !assignments || assignments.length === 0) return [];

  const customerIds = assignments.map((a) => a.customer_id);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, email, phone, role, distributor_id, notes, customer_status")
    .in("user_id", customerIds);

  const { data: accounts } = await supabase
    .from("customer_accounts")
    .select("customer_id, current_balance, current_debt, total_topups, total_payments, last_topup, last_payment")
    .in("customer_id", customerIds);

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
  const accountMap = new Map((accounts || []).map((a) => [a.customer_id, a]));

  return assignments.map((a) => {
    const profile = profileMap.get(a.customer_id);
    const account = accountMap.get(a.customer_id);
    return {
      user_id: a.customer_id,
      display_name: profile?.display_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      role: profile?.role ?? "customer",
      distributor_id: profile?.distributor_id ?? null,
      notes: profile?.notes ?? null,
      customer_status: profile?.customer_status ?? "active",
      current_balance: account?.current_balance,
      current_debt: account?.current_debt,
      total_topups: account?.total_topups,
      total_payments: account?.total_payments,
      last_topup: account?.last_topup ?? null,
      last_payment: account?.last_payment ?? null,
    };
  });
}

export async function searchCustomers(query: string, distributorUserId?: string): Promise<CustomerWithProfile[]> {
  if (!query.trim()) return [];

  const trimmed = query.trim();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, email, phone, role, distributor_id, notes, customer_status")
    .eq("role", "customer")
    .or(`display_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`)
    .limit(50);

  if (!profiles || profiles.length === 0) return [];

  const profileIds = profiles.map((p) => p.user_id);

  const { data: accounts } = await supabase
    .from("customer_accounts")
    .select("customer_id, current_balance, current_debt, total_topups, total_payments, last_topup, last_payment")
    .in("customer_id", profileIds);

  const accountMap = new Map((accounts || []).map((a) => [a.customer_id, a]));

  let filtered = profiles;

  if (distributorUserId) {
    const { data: assignments } = await supabase
      .from("distributor_customers")
      .select("customer_id")
      .eq("distributor_id", distributorUserId);

    const assignedIds = new Set((assignments || []).map((a) => a.customer_id));
    filtered = profiles.filter((p) => assignedIds.has(p.user_id));
  }

  return filtered.map((profile) => {
    const account = accountMap.get(profile.user_id);
    return {
      user_id: profile.user_id,
      display_name: profile.display_name,
      email: profile.email,
      phone: profile.phone,
      role: profile.role,
      distributor_id: profile.distributor_id,
      notes: profile.notes,
      customer_status: profile.customer_status,
      current_balance: account?.current_balance,
      current_debt: account?.current_debt,
      total_topups: account?.total_topups,
      total_payments: account?.total_payments,
      last_topup: account?.last_topup ?? null,
      last_payment: account?.last_payment ?? null,
    };
  });
}

export async function getCustomerAccount(customerUserId: string) {
  const { data, error } = await supabase
    .from("customer_accounts")
    .select("*")
    .eq("customer_id", customerUserId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function getCustomerTransactions(
  customerUserId: string,
  page = 1,
  pageSize = 20,
): Promise<{ data: CustomerTransaction[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("customer_transactions")
    .select("*", { count: "exact" })
    .eq("customer_id", customerUserId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return { data: [], total: 0 };
  return { data: (data || []) as CustomerTransaction[], total: count || 0 };
}

export async function getTopupRequests(
  distributorUserId?: string,
  status?: string,
): Promise<TopupRequest[]> {
  let query = supabase
    .from("topup_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (distributorUserId) {
    query = query.eq("distributor_id", distributorUserId);
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data: requests, error } = await query;
  if (error || !requests || requests.length === 0) return [];

  const customerIds = [...new Set(requests.map((r) => r.customer_id))];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, email")
    .in("user_id", customerIds);

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

  return requests.map((r) => {
    const profile = profileMap.get(r.customer_id);
    return {
      id: r.id,
      customer_id: r.customer_id,
      distributor_id: r.distributor_id,
      operator: r.operator,
      amount: r.amount,
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      completed_by: r.completed_by,
      notes: r.notes,
      customer_display_name: profile?.display_name ?? null,
      customer_email: profile?.email ?? null,
    };
  });
}

export async function assignCustomerToDistributor(
  customerUserId: string,
  distributorUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("admin_assign_customer_to_distributor" as never, {
    _customer_user_id: customerUserId,
    _distributor_user_id: distributorUserId,
  } as never);
  if (error) return { success: false, error: error.message };
  return parseRpcResult(data);
}

export async function addDebt(
  customerUserId: string,
  amount: number,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("distributor_add_debt" as never, {
    _customer_user_id: customerUserId,
    _amount: amount,
    _notes: notes || null,
  } as never);
  if (error) return { success: false, error: error.message };
  return parseRpcResult(data);
}

export async function registerPayment(
  customerUserId: string,
  amount: number,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("distributor_register_payment" as never, {
    _customer_user_id: customerUserId,
    _amount: amount,
    _notes: notes || null,
  } as never);
  if (error) return { success: false, error: error.message };
  return parseRpcResult(data);
}

export async function adjustCredit(
  customerUserId: string,
  amount: number,
  type?: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("distributor_adjust_credit" as never, {
    _customer_user_id: customerUserId,
    _amount: amount,
    _type: type || null,
    _notes: notes || null,
  } as never);
  if (error) return { success: false, error: error.message };
  return parseRpcResult(data);
}

export async function completeTopup(
  requestId: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("complete_topup_request" as never, {
    _request_id: requestId,
    _action: "complete",
    _notes: notes || null,
  } as never);
  if (error) return { success: false, error: error.message };
  return parseRpcResult(data);
}

export async function cancelTopup(
  requestId: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("complete_topup_request" as never, {
    _request_id: requestId,
    _action: "cancel",
    _notes: notes || null,
  } as never);
  if (error) return { success: false, error: error.message };
  return parseRpcResult(data);
}

export async function updateCustomerNotes(
  customerUserId: string,
  notes: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("distributor_update_customer_notes" as never, {
    _customer_user_id: customerUserId,
    _notes: notes,
  } as never);
  if (error) return { success: false, error: error.message };
  return parseRpcResult(data);
}
