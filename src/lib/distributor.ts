import { supabase } from "@/integrations/supabase/client";

// ─── Interfaces ──────────────────────────────────────────────

export interface DistributorInfo {
  id: string;
  user_id: string;
  code: string;
  commission_rate: number;
  status: string;
  created_at: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  customer_count: number;
  active_customer_count: number;
  payment_count: number;
  total_sales: number;
  total_commission: number;
  total_paid: number;
}

export interface DistributorDetail {
  ok: boolean;
  distributor?: {
    user_id: string;
    code: string;
    commission_rate: number;
    status: string;
    created_at: string;
    display_name: string | null;
    email: string | null;
    phone: string | null;
    customer_count: number;
    total_sales: number;
    total_commission: number;
  };
  customers?: DistributorCustomer[];
  error?: string;
}

export interface DistributorCustomer {
  user_id: string;
  display_name: string | null;
  email: string | null;
  license_status: string | null;
  expiry_date: string | null;
  created_at: string;
  last_login: string | null;
  total_payments: number;
  distributor_commission: number;
}

export interface DistributorDashboard {
  ok: boolean;
  distributor?: {
    id: string;
    code: string;
    commission_rate: number;
    display_name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string;
  };
  stats?: {
    total_customers: number;
    active_customers: number;
    total_payments: number;
    total_amount: number;
    total_commission: number;
    today_commission: number;
    monthly_commission: number;
    total_paid: number;
    total_pending: number;
  };
  error?: string;
}

export interface DistributorPayout {
  id: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface DistributorReport {
  ok: boolean;
  period: string;
  daily: Array<{
    day: string;
    payment_count: number;
    total_amount: number;
    total_commission: number;
  }>;
  customer_ranking: Array<{
    user_id: string;
    display_name: string | null;
    payment_count: number;
    total_amount: number;
    total_commission: number;
  }>;
  error?: string;
}

// ─── Customer Self-Link ──────────────────────────────────────

export async function linkToDistributor(code: string) {
  const { data, error } = await supabase.rpc("link_to_distributor", { _code: code });
  if (error) throw error;
  return data as { ok: boolean; distributor_code?: string; distributor_name?: string; commission_rate?: number; error?: string };
}

export async function getMyDistributor() {
  const { data, error } = await supabase.rpc("get_my_distributor");
  if (error) throw error;
  return data as { ok: boolean; linked: boolean; distributor_code?: string; distributor_name?: string; commission_rate?: number };
}

// ─── Admin Operations ────────────────────────────────────────

export async function adminGrantDistributor(userId: string, commissionRate: number = 5) {
  const { data, error } = await supabase.rpc("admin_grant_distributor", {
    _user_id: userId,
    _commission_rate: commissionRate,
  });
  if (error) throw error;
  return data as { ok: boolean; distributor_id?: string; code?: string; commission_rate?: number; error?: string };
}

export async function adminRevokeDistributor(userId: string) {
  const { data, error } = await supabase.rpc("admin_revoke_distributor", { _user_id: userId });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}

export async function adminUpdateDistributor(userId: string, params: {
  commission_rate?: number;
  status?: string;
}) {
  const { data, error } = await supabase.rpc("admin_update_distributor", {
    _user_id: userId,
    _commission_rate: params.commission_rate ?? null,
    _status: params.status || null,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}

export async function adminGetDistributors(params: {
  search?: string;
  status?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const { data, error } = await supabase.rpc("admin_get_distributors", {
    _search: params.search || null,
    _status: params.status || null,
    _page: params.page || 1,
    _page_size: params.page_size || 20,
  });
  if (error) throw error;
  return data as { distributors: DistributorInfo[]; total: number; page: number; page_size: number };
}

export async function adminGetDistributorDetail(userId: string) {
  const { data, error } = await supabase.rpc("admin_get_distributor_detail", { _user_id: userId });
  if (error) throw error;
  return data as DistributorDetail;
}

export async function adminAssignCustomerToDistributor(customerId: string, distributorUserId: string) {
  const { data, error } = await supabase.rpc("admin_assign_customer_to_distributor", {
    _customer_id: customerId,
    _distributor_user_id: distributorUserId,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}

export async function adminRemoveCustomerFromDistributor(customerId: string) {
  const { data, error } = await supabase.rpc("admin_remove_customer_from_distributor", {
    _customer_id: customerId,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}

// ─── Distributor Panel Operations ────────────────────────────

export async function distributorGetDashboard() {
  const { data, error } = await supabase.rpc("distributor_get_dashboard");
  if (error) throw error;
  return data as DistributorDashboard;
}

export async function distributorGetCustomers(params: {
  search?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const { data, error } = await supabase.rpc("distributor_get_customers", {
    _search: params.search || null,
    _page: params.page || 1,
    _page_size: params.page_size || 20,
  });
  if (error) throw error;
  return data as { customers: DistributorCustomer[]; total: number };
}

export async function distributorGetReport(params: {
  period?: string;
} = {}) {
  const { data, error } = await supabase.rpc("distributor_get_report", {
    _period: params.period || "month",
  });
  if (error) throw error;
  return data as DistributorReport;
}

// ─── Payout Operations ──────────────────────────────────────

export async function adminRecordDistributorPayout(distributorId: string, amount: number, notes?: string) {
  const { data, error } = await supabase.rpc("admin_record_distributor_payout", {
    p_distributor_id: distributorId,
    p_amount: amount,
    p_notes: notes || null,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}

export async function distributorGetPayouts() {
  const { data, error } = await supabase.rpc("distributor_get_payouts");
  if (error) throw error;
  return data as { ok: boolean; payouts: DistributorPayout[]; error?: string };
}
