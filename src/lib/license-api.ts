/**
 * License API — التحقق المركزي من التراخيص عبر Google Apps Script
 */

import { getDeviceId } from './device-id';

const LICENSE_API_KEY = 'license_api_endpoint_v1';
const ONLINE_STATUS_KEY = 'license_online_status_v1';
const LAST_ONLINE_CHECK_KEY = 'license_last_online_check_v1';

export interface OnlineLicenseStatus {
  status: 'active' | 'revoked' | 'expired' | 'not_found' | 'error';
  expiryDate?: string;
  customerName?: string;
  message?: string;
}

export interface CentralLicense {
  deviceId: string;
  licenseKey: string;
  expiryDate: string;
  status: 'active' | 'revoked' | 'expired';
  customerName: string;
  createdAt: string;
  lastCheck: string;
}

// ============ Endpoint ============

export function getLicenseApiEndpoint(): string {
  return localStorage.getItem(LICENSE_API_KEY) || '';
}

export function saveLicenseApiEndpoint(url: string) {
  localStorage.setItem(LICENSE_API_KEY, url);
}

// ============ Online Verification ============

export async function verifyLicenseOnline(): Promise<OnlineLicenseStatus> {
  const endpoint = getLicenseApiEndpoint();
  if (!endpoint) return { status: 'error', message: 'لم يتم تعيين رابط API' };

  const deviceId = getDeviceId();
  
  try {
    const url = `${endpoint}?action=verify&deviceId=${encodeURIComponent(deviceId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!res.ok) return { status: 'error', message: 'خطأ في الاتصال' };
    
    const data = await res.json();
    
    // Cache the result locally
    const result: OnlineLicenseStatus = {
      status: data.status || 'error',
      expiryDate: data.expiryDate,
      customerName: data.customerName,
      message: data.message,
    };
    
    localStorage.setItem(ONLINE_STATUS_KEY, JSON.stringify(result));
    localStorage.setItem(LAST_ONLINE_CHECK_KEY, new Date().toISOString());
    
    return result;
  } catch (e) {
    // Offline — return cached result
    return getCachedOnlineStatus();
  }
}

export function getCachedOnlineStatus(): OnlineLicenseStatus {
  try {
    const cached = localStorage.getItem(ONLINE_STATUS_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return { status: 'error', message: 'لا يوجد نتيجة سابقة' };
}

export function getLastOnlineCheck(): string | null {
  return localStorage.getItem(LAST_ONLINE_CHECK_KEY);
}

// ============ Admin: Register License ============

export async function registerLicenseOnline(data: {
  deviceId: string;
  licenseKey: string;
  expiryDate: string;
  customerName: string;
}): Promise<{ success: boolean; message?: string }> {
  const endpoint = getLicenseApiEndpoint();
  if (!endpoint) return { success: false, message: 'لم يتم تعيين رابط API' };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', ...data }),
    });
    return await res.json();
  } catch {
    return { success: false, message: 'خطأ في الاتصال' };
  }
}

// ============ Admin: Revoke License ============

export async function revokeLicenseOnline(deviceId: string): Promise<{ success: boolean; message?: string }> {
  const endpoint = getLicenseApiEndpoint();
  if (!endpoint) return { success: false, message: 'لم يتم تعيين رابط API' };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', deviceId }),
    });
    return await res.json();
  } catch {
    return { success: false, message: 'خطأ في الاتصال' };
  }
}

// ============ Admin: Reactivate License ============

export async function reactivateLicenseOnline(deviceId: string): Promise<{ success: boolean; message?: string }> {
  const endpoint = getLicenseApiEndpoint();
  if (!endpoint) return { success: false, message: 'لم يتم تعيين رابط API' };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reactivate', deviceId }),
    });
    return await res.json();
  } catch {
    return { success: false, message: 'خطأ في الاتصال' };
  }
}

// ============ Admin: Extend License ============

export async function extendLicenseOnline(deviceId: string, newExpiryDate: string): Promise<{ success: boolean; message?: string }> {
  const endpoint = getLicenseApiEndpoint();
  if (!endpoint) return { success: false, message: 'لم يتم تعيين رابط API' };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'extend', deviceId, expiryDate: newExpiryDate }),
    });
    return await res.json();
  } catch {
    return { success: false, message: 'خطأ في الاتصال' };
  }
}

// ============ Admin: Get All Licenses ============

export async function getAllLicensesOnline(): Promise<{ success: boolean; licenses?: CentralLicense[]; message?: string }> {
  const endpoint = getLicenseApiEndpoint();
  if (!endpoint) return { success: false, message: 'لم يتم تعيين رابط API' };

  try {
    const res = await fetch(`${endpoint}?action=list`);
    return await res.json();
  } catch {
    return { success: false, message: 'خطأ في الاتصال' };
  }
}
