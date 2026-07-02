/**
 * Trial Expiration & Activation Request Flow
 * Routes through edge functions (no direct client inserts — RLS forbids them).
 * Kept modular so the Supabase backend can be swapped later.
 */

import { supabase } from '@/integrations/supabase/client';
import { getDeviceId } from './device-id';
import { flush, pushEvent } from './supabase-sync';

const ACTIVATION_REQUEST_KEY = 'activation_request_v1';

export interface ActivationRequest {
  requestToken: string;
  deviceId: string;
  createdAt: string;
  contactName?: string;
  contactPhone?: string;
  ussdNumbers: string[];
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Generate a unique activation request for a device via edge function.
 */
export async function createActivationRequest(
  contactName?: string,
  contactPhone?: string,
  ussdNumbers: string[] = []
): Promise<ActivationRequest | null> {
  try {
    const deviceId = getDeviceId();
    if (!deviceId || deviceId === 'initializing...' || deviceId.length < 4) {
      console.error('Activation request: device id not ready');
      return null;
    }

    const offlineToken = crypto.randomUUID();
    const queueOfflineRequest = () => {
      pushEvent('activation_request', {
        request_token: offlineToken,
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        ussd_numbers: ussdNumbers,
      });
      return offlineToken;
    };

    let data: { ok?: boolean; token?: string } | null = null;
    let error: { message?: string } | null = null;
    if (navigator.onLine) {
      const response = await supabase.functions.invoke('request-activation', {
        body: {
          device_id: deviceId,
          contact_name: contactName || null,
          contact_phone: contactPhone || null,
          ussd_numbers: ussdNumbers,
        },
      });
      data = response.data;
      error = response.error;
    }
    const token = data?.ok && data.token ? data.token : queueOfflineRequest();

    if (navigator.onLine && error && !token) {
      console.error('request-activation failed:', error, data);
      return null;
    }

    const request: ActivationRequest = {
      requestToken: token,
      deviceId,
      createdAt: new Date().toISOString(),
      contactName,
      contactPhone,
      ussdNumbers,
      status: 'pending',
    };

    localStorage.setItem(ACTIVATION_REQUEST_KEY, JSON.stringify(request));
    return request;
  } catch (e) {
    console.error('Error creating activation request:', e);
    return null;
  }
}

/**
 * Get locally cached activation request for this device.
 */
export function getLocalActivationRequest(): ActivationRequest | null {
  try {
    const stored = localStorage.getItem(ACTIVATION_REQUEST_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

/**
 * Poll status — used by the trial-expired screen to know when admin approves.
 */
export async function checkActivationStatus(
  requestToken: string
): Promise<'pending' | 'approved' | 'rejected' | 'error'> {
  try {
    const { data, error } = await supabase
      .from('activations')
      .select('status, license_id')
      .eq('request_token', requestToken)
      .maybeSingle();

    if (error || !data) return 'error';

    const local = getLocalActivationRequest();
    if (local) {
      localStorage.setItem(ACTIVATION_REQUEST_KEY, JSON.stringify({
        ...local,
        status: data.status,
      }));
    }

    if (data.status === 'approved' && data.license_id) {
      await flush();
    }
    return data.status as 'pending' | 'approved' | 'rejected';
  } catch (e) {
    console.error('checkActivationStatus error:', e);
    return 'error';
  }
}

/**
 * Admin: Approve activation request — generates a real AB12-CD34-EF56 key
 * via the admin-create-license edge function and links it to the device.
 */
export async function adminApproveActivation(
  requestToken: string,
  expiryDate: string | null,
  ussdNumbers: string[] = [],
  permanent = false
): Promise<{ success: boolean; licenseKey?: string; error?: string }> {
  try {
    // Fetch the activation row (admin RLS allows full read).
    const { data: activation, error: fetchError } = await supabase
      .from('activations')
      .select('*')
      .eq('request_token', requestToken)
      .maybeSingle();

    if (fetchError || !activation) {
      return { success: false, error: 'Activation request not found' };
    }

    // Generate license key via edge function (handles uniqueness + audit).
    const { data: licData, error: licErr } = await supabase.functions.invoke('admin-create-license', {
      body: {
        device_id: activation.device_id,
        expiry_date: permanent ? null : expiryDate,
        permanent,
        user_id: activation.user_id,
        ussd_numbers: ussdNumbers.length > 0 ? ussdNumbers : activation.ussd_numbers,
        notes: `From activation ${requestToken}`,
      },
    });

    if (licErr || !licData?.ok || !licData?.license) {
      return { success: false, error: licData?.error || licErr?.message || 'license creation failed' };
    }

    const { data: decision, error: decisionError } = await supabase.rpc('admin_decide_activation', {
      _request_id: activation.id,
      _decision: 'approved',
      _license_id: licData.license.id,
      _notes: `Approved request ${requestToken}`,
    });
    const decisionResult = decision as { ok?: boolean; reason?: string } | null;
    if (decisionError || !decisionResult?.ok) {
      return { success: false, error: decisionError?.message || decisionResult?.reason || 'activation decision failed' };
    }

    return { success: true, licenseKey: licData.formatted || licData.license.license_key };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Admin: Reject an activation request.
 */
export async function adminRejectActivation(
  requestToken: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: activation, error: fetchError } = await supabase
      .from('activations')
      .select('id')
      .eq('request_token', requestToken)
      .maybeSingle();
    if (fetchError || !activation) return { success: false, error: fetchError?.message || 'Activation not found' };
    const { data, error } = await supabase.rpc('admin_decide_activation', {
      _request_id: activation.id,
      _decision: 'rejected',
      _license_id: null,
      _notes: reason ?? null,
    });
    const result = data as { ok?: boolean; reason?: string } | null;
    if (error || !result?.ok) return { success: false, error: error?.message || result?.reason || 'Reject failed' };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Admin: Block / Unblock device.
 */
export async function adminSetDeviceBlocked(
  deviceId: string,
  blocked: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = blocked
      ? await supabase.rpc('admin_block_device', { _device_id: deviceId, _reason: 'Blocked by administrator' })
      : await supabase.rpc('admin_unblock_device', { _device_id: deviceId });
    const result = data as { ok?: boolean; reason?: string } | null;
    if (error || !result?.ok) return { success: false, error: error?.message || result?.reason || 'Device update failed' };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
