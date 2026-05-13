/**
 * Trial Expiration & Activation Request Flow
 * Generates unique activation request links for expired trials
 */

import { supabase } from '@/integrations/supabase/client';
import { getDeviceId } from './device-id';

const ACTIVATION_REQUEST_KEY = 'activation_request_v1';
const REQUEST_LINK_PREFIX = 'https://activate.app.local/request/'; // Update with actual domain

export interface ActivationRequest {
  requestToken: string;
  deviceId: string;
  createdAt: string;
  expiresAt: string;
  contactName?: string;
  contactPhone?: string;
  ussdNumbers: string[];
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Generate a unique activation request for a device
 */
export async function createActivationRequest(
  contactName?: string,
  contactPhone?: string,
  ussdNumbers: string[] = []
): Promise<ActivationRequest | null> {
  try {
    const deviceId = getDeviceId();
    const requestToken = generateRequestToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    const { data, error } = await supabase
      .from('activations')
      .insert({
        request_token: requestToken,
        device_id: deviceId,
        contact_name: contactName,
        contact_phone: contactPhone,
        ussd_numbers: ussdNumbers,
        status: 'pending',
        created_at: now.toISOString(),
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating activation request:', error);
      return null;
    }
    
    const request: ActivationRequest = {
      requestToken,
      deviceId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      contactName,
      contactPhone,
      ussdNumbers,
      status: 'pending',
    };
    
    // Store locally
    localStorage.setItem(ACTIVATION_REQUEST_KEY, JSON.stringify(request));
    
    return request;
  } catch (e) {
    console.error('Error creating activation request:', e);
    return null;
  }
}

/**
 * Generate a unique request token
 * Format: 16-character alphanumeric code
 */
export function generateRequestToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Get the activation request link to share
 */
export function getActivationRequestLink(requestToken: string): string {
  return `${REQUEST_LINK_PREFIX}${requestToken}`;
}

/**
 * Get locally stored activation request
 */
export function getLocalActivationRequest(): ActivationRequest | null {
  try {
    const stored = localStorage.getItem(ACTIVATION_REQUEST_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

/**
 * Check if activation request has been approved (admin)
 */
export async function checkActivationStatus(requestToken: string): Promise<'pending' | 'approved' | 'rejected' | 'error'> {
  try {
    const { data, error } = await supabase
      .from('activations')
      .select('status, license_id')
      .eq('request_token', requestToken)
      .single();
    
    if (error) return 'error';
    
    if (data.status === 'approved' && data.license_id) {
      // Try to get the license key
      const { data: license } = await supabase
        .from('licenses')
        .select('license_key')
        .eq('id', data.license_id)
        .single();
      
      if (license) {
        // Cache it locally
        localStorage.setItem('trial_approved_license', license.license_key);
      }
    }
    
    return data.status;
  } catch (e) {
    console.error('Error checking activation status:', e);
    return 'error';
  }
}

/**
 * Admin: Approve an activation request and generate license
 */
export async function adminApproveActivation(
  requestToken: string,
  expiryDate: string,
  ussdNumbers: string[] = []
): Promise<{ success: boolean; licenseKey?: string; error?: string }> {
  try {
    // Get the activation request
    const { data: activation, error: fetchError } = await supabase
      .from('activations')
      .select('*')
      .eq('request_token', requestToken)
      .single();
    
    if (fetchError || !activation) {
      return { success: false, error: 'Activation request not found' };
    }
    
    // Generate license key
    const licenseKey = generateRequestToken(); // Use similar format
    
    // Create license
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .insert({
        license_key: licenseKey,
        device_id: activation.device_id,
        status: 'active',
        expiry_date: expiryDate,
        ussd_numbers: ussdNumbers.length > 0 ? ussdNumbers : activation.ussd_numbers,
        created_by: (await supabase.auth.getUser()).data.user?.id,
        activated_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (licenseError) {
      return { success: false, error: 'Failed to create license' };
    }
    
    // Update activation
    const { error: updateError } = await supabase
      .from('activations')
      .update({
        status: 'approved',
        license_id: license.id,
        processed_at: new Date().toISOString(),
      })
      .eq('request_token', requestToken);
    
    if (updateError) {
      return { success: false, error: 'Failed to update activation' };
    }
    
    return { success: true, licenseKey };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Admin: Reject an activation request
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
        notes: reason,
      })
      .eq('request_token', requestToken);
    
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Get all pending activation requests (admin)
 */
export async function getPendingActivations() {
  try {
    const { data, error } = await supabase
      .from('activations')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error fetching activations:', e);
    return [];
  }
}

/**
 * Get activation statistics (admin)
 */
export async function getActivationStatistics() {
  try {
    const { data, error } = await supabase
      .from('activations')
      .select('status');
    
    if (error) throw error;
    
    const stats = {
      total: data?.length || 0,
      pending: data?.filter(a => a.status === 'pending').length || 0,
      approved: data?.filter(a => a.status === 'approved').length || 0,
      rejected: data?.filter(a => a.status === 'rejected').length || 0,
    };
    
    return stats;
  } catch (e) {
    console.error('Error fetching activation stats:', e);
    return { total: 0, pending: 0, approved: 0, rejected: 0 };
  }
}
