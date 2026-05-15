/**
 * Trial Expiration & Activation Request Flow
 * Routes through edge functions (no direct client inserts — RLS forbids them).
 * Kept modular so the Supabase backend can be swapped later.
 */

import { supabase } from '@/integrations/supabase/client';
import { getDeviceId } from './device-id';

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

    const { data, error } = await supabase.functions.invoke('request-activation', {
      body: {
        device_id: deviceId,
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        ussd_numbers: ussdNumbers,
      },
    });

    if (error || !data?.ok || !data?.token) {
      console.error('request-activation failed:', error, data);
      return null;
    }

    const request: ActivationRequest = {
      requestToken: data.token,
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
 * Build the shareable activation request URL the customer sends to the admin.
 */
export function getActivationRequestLink(requestToken: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/sys-panel?activation=${requestToken}`;
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

    if (data.status === 'approved' && data.license_id) {
      const { data: license } = await supabase
        .from('licenses')
        .select('license_key')
        .eq('id', data.license_id)
        .maybeSingle();
      if (license) {
        localStorage.setItem('trial_approved_license', license.license_key);
      }
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
        ussd_numbers: ussdNumbers.length > 0 ? ussdNumbers : activation.ussd_numbers,
        notes: `From activation ${requestToken}`,
      },
    });

    if (licErr || !licData?.ok || !licData?.license) {
      return { success: false, error: licData?.error || licErr?.message || 'license creation failed' };
    }

    // Link activation → license
    const { error: updErr } = await supabase
      .from('activations')
      .update({
        status: 'approved',
        license_id: licData.license.id,
        processed_at: new Date().toISOString(),
      })
      .eq('request_token', requestToken);

    if (updErr) return { success: false, error: updErr.message };

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
    const { error } = await supabase
      .from('activations')
      .update({
        status: 'rejected',
        processed_at: new Date().toISOString(),
        notes: reason ?? null,
      })
      .eq('request_token', requestToken);
    if (error) return { success: false, error: error.message };
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
    // Upsert device row so we can flip is_blocked even if it never synced.
    const { error } = await supabase
      .from('devices')
      .upsert({ device_id: deviceId, is_blocked: blocked }, { onConflict: 'device_id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
