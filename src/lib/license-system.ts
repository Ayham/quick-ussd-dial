/**
 * Professional Licensing System
 * 12-character format: AB12-CD34-EF56
 */

import { supabase } from '@/integrations/supabase/client';
import { getDeviceId } from './device-id';

const GENERATED_KEYS_STORE = 'admin_generated_keys_v1';
const LICENSE_CACHE_KEY = 'license_cache_v1';

export interface LicenseInfo {
  key: string;
  deviceId: string;
  status: 'active' | 'expired' | 'revoked' | 'pending';
  expiryDate: string | null;
  permanent: boolean;
  ussdNumbers: string[];
  createdAt: string;
  activatedAt?: string;
}

/**
 * Generate a professional 12-character license key
 * Format: AB12-CD34-EF56
 */
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) key += '-';
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return key;
}

/**
 * Validate license key format
 */
export function isValidLicenseFormat(key: string): boolean {
  const pattern = /^[A-Z0-9]{2}\d{2}-[A-Z0-9]{2}\d{2}-[A-Z0-9]{2}\d{2}$/;
  return pattern.test(key);
}

/**
 * Generate license keys for admin use
 */
export async function adminGenerateLicenses(
  count: number,
  expiryDate: string | null,
  permanent: boolean,
  ussdNumbers: string[] = []
): Promise<{ success: boolean; keys: string[]; error?: string }> {
  try {
    const keys: string[] = [];

    for (let i = 0; i < count; i++) {
      const { data, error } = await supabase.functions.invoke('admin-create-license', {
        body: {
          expiry_date: permanent ? null : expiryDate,
          permanent,
          ussd_numbers: ussdNumbers,
        },
      });

      if (error || !data?.ok || !data?.license?.license_key) {
        return { success: false, keys, error: data?.error || error?.message || 'Failed to generate license' };
      }

      keys.push(data.formatted || data.license.license_key);
    }

    // Store generation record
    saveGeneratedKeys(keys, expiryDate, permanent, ussdNumbers);

    return { success: true, keys };
  } catch (e) {
    return { success: false, keys: [], error: String(e) };
  }
}

/**
 * Save generated keys locally for admin records
 */
function saveGeneratedKeys(
  keys: string[],
  expiryDate: string | null,
  permanent: boolean,
  ussdNumbers: string[]
) {
  try {
    const stored = localStorage.getItem(GENERATED_KEYS_STORE);
    const records = stored ? JSON.parse(stored) : [];
    
    records.push({
      keys,
      expiryDate,
      permanent,
      ussdNumbers,
      generatedAt: new Date().toISOString(),
    });
    
    localStorage.setItem(GENERATED_KEYS_STORE, JSON.stringify(records.slice(-100))); // Keep last 100
  } catch (e) {
    console.error('Error saving generated keys:', e);
  }
}

/**
 * Activate a license on the device
 */
export async function activateLicense(key: string): Promise<{ valid: boolean; error?: string }> {
  if (!isValidLicenseFormat(key)) {
    return { valid: false, error: 'Invalid license format' };
  }
  
  try {
    const deviceId = getDeviceId();
    
    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', key)
      .single();
    
    if (error || !data) {
      return { valid: false, error: 'License not found' };
    }
    
    if (data.status === 'revoked') {
      return { valid: false, error: 'License has been revoked' };
    }
    
    if (data.status === 'expired') {
      return { valid: false, error: 'License has expired' };
    }
    
    // Check expiry date
    if (data.expiry_date && !data.permanent) {
      const expiryDate = new Date(data.expiry_date);
      if (expiryDate < new Date()) {
        return { valid: false, error: 'License has expired' };
      }
    }
    
    // Activate the license
    const { error: updateError } = await supabase
      .from('licenses')
      .update({
        device_id: deviceId,
        status: 'active',
        activated_at: new Date().toISOString(),
      })
      .eq('license_key', key);
    
    if (updateError) {
      return { valid: false, error: updateError.message };
    }
    
    // Cache license locally
    cacheLicense({
      key,
      deviceId,
      status: 'active',
      expiryDate: data.expiry_date,
      permanent: data.permanent,
      ussdNumbers: data.ussd_numbers,
      createdAt: data.created_at,
      activatedAt: new Date().toISOString(),
    });
    
    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

/**
 * Get locally cached license
 */
export function getCachedLicense(): LicenseInfo | null {
  try {
    const stored = localStorage.getItem(LICENSE_CACHE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

/**
 * Cache license locally
 */
function cacheLicense(license: LicenseInfo) {
  localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(license));
}

/**
 * Revoke a license (admin only)
 */
export async function revokeLicense(licenseKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('licenses')
      .update({ status: 'revoked' })
      .eq('license_key', licenseKey);
    
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Extend license expiry (admin only)
 */
export async function extendLicense(licenseKey: string, newExpiryDate: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('licenses')
      .update({ expiry_date: newExpiryDate })
      .eq('license_key', licenseKey);
    
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Get all active licenses (admin only)
 */
export async function getAllActiveLicenses() {
  try {
    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error fetching licenses:', e);
    return [];
  }
}

/**
 * Get license statistics (admin only)
 */
export async function getLicenseStatistics() {
  try {
    const { data, error } = await supabase
      .from('licenses')
      .select('status');
    
    if (error) throw error;
    
    const stats = {
      total: data?.length || 0,
      active: data?.filter(l => l.status === 'active').length || 0,
      expired: data?.filter(l => l.status === 'expired').length || 0,
      revoked: data?.filter(l => l.status === 'revoked').length || 0,
      pending: data?.filter(l => l.status === 'pending').length || 0,
    };
    
    return stats;
  } catch (e) {
    console.error('Error fetching license stats:', e);
    return { total: 0, active: 0, expired: 0, revoked: 0, pending: 0 };
  }
}
