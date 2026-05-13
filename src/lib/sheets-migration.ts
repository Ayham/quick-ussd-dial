/**
 * Google Sheets Data Migration
 * Migrates existing data from Google Sheets to Supabase
 */

import { supabase } from '@/integrations/supabase/client';

const MIGRATION_LOG_KEY = 'sheets_migration_log_v1';

export interface MigrationStatus {
  isComplete: boolean;
  startedAt?: string;
  completedAt?: string;
  recordsMigrated?: number;
  errors?: string[];
}

export function getMigrationStatus(): MigrationStatus {
  try {
    const stored = localStorage.getItem(MIGRATION_LOG_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { isComplete: false };
}

export function setMigrationStatus(status: MigrationStatus) {
  localStorage.setItem(MIGRATION_LOG_KEY, JSON.stringify(status));
}

/**
 * Migrate data from Google Sheets using the provided script
 * The URL should point to a Google Apps Script that exports the data as JSON
 */
export async function migrateFromGoogleSheets(
  sheetsScriptUrl: string,
  onProgress?: (message: string) => void
): Promise<MigrationStatus> {
  const status: MigrationStatus = {
    isComplete: false,
    startedAt: new Date().toISOString(),
    errors: [],
    recordsMigrated: 0,
  };

  try {
    onProgress?.('Fetching data from Google Sheets...');

    // Fetch data from the Google Apps Script
    const response = await fetch(sheetsScriptUrl, {
      method: 'GET',
      mode: 'cors',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sheets data: ${response.statusText}`);
    }

    const data = await response.json();
    let migrated = 0;

    // Migrate licenses
    if (data.licenses && Array.isArray(data.licenses)) {
      onProgress?.(`Migrating ${data.licenses.length} licenses...`);
      for (const license of data.licenses) {
        try {
          const { error } = await supabase
            .from('licenses')
            .upsert({
              license_key: license.key || crypto.randomUUID(),
              device_id: license.deviceId,
              status: license.status || 'pending',
              expiry_date: license.expiryDate,
              permanent: license.permanent === true,
              ussd_numbers: license.ussdNumbers || [],
              notes: license.notes,
            }, { onConflict: 'license_key' });

          if (!error) migrated++;
          else status.errors?.push(`License ${license.key}: ${error.message}`);
        } catch (e) {
          status.errors?.push(`License ${license.key}: ${String(e)}`);
        }
      }
    }

    // Migrate transfers
    if (data.transfers && Array.isArray(data.transfers)) {
      onProgress?.(`Migrating ${data.transfers.length} transfers...`);
      for (const transfer of data.transfers) {
        try {
          const { error } = await supabase
            .from('transfers')
            .insert({
              device_id: transfer.deviceId,
              client_id: transfer.id || `imported-${Date.now()}-${Math.random()}`,
              phone: transfer.phone,
              amount: transfer.amount,
              operator: transfer.operator,
              status: transfer.status || 'completed',
              created_at: transfer.timestamp || new Date().toISOString(),
            });

          if (!error) migrated++;
          else status.errors?.push(`Transfer: ${error.message}`);
        } catch (e) {
          status.errors?.push(`Transfer: ${String(e)}`);
        }
      }
    }

    // Migrate USSD codes
    if (data.ussdCodes && Array.isArray(data.ussdCodes)) {
      onProgress?.(`Migrating ${data.ussdCodes.length} USSD codes...`);
      for (const code of data.ussdCodes) {
        try {
          const { error } = await supabase
            .from('ussd_codes')
            .upsert({
              device_id: code.deviceId,
              operator: code.operator,
              label: code.label,
              template: code.template,
              sort_order: code.sortOrder || 0,
              is_active: code.isActive !== false,
            }, { onConflict: 'device_id,operator' });

          if (!error) migrated++;
          else status.errors?.push(`USSD Code ${code.operator}: ${error.message}`);
        } catch (e) {
          status.errors?.push(`USSD Code: ${String(e)}`);
        }
      }
    }

    // Migrate activations
    if (data.activations && Array.isArray(data.activations)) {
      onProgress?.(`Migrating ${data.activations.length} activations...`);
      for (const activation of data.activations) {
        try {
          const { error } = await supabase
            .from('activations')
            .insert({
              request_token: activation.token || crypto.randomUUID(),
              device_id: activation.deviceId,
              contact_phone: activation.contactPhone,
              contact_name: activation.contactName,
              ussd_numbers: activation.ussdNumbers || [],
              status: activation.status || 'pending',
              notes: activation.notes,
              created_at: activation.createdAt || new Date().toISOString(),
            });

          if (!error) migrated++;
          else status.errors?.push(`Activation: ${error.message}`);
        } catch (e) {
          status.errors?.push(`Activation: ${String(e)}`);
        }
      }
    }

    // Migrate devices
    if (data.devices && Array.isArray(data.devices)) {
      onProgress?.(`Migrating ${data.devices.length} devices...`);
      for (const device of data.devices) {
        try {
          const { error } = await supabase
            .from('devices')
            .upsert({
              device_id: device.deviceId,
              name: device.name,
              model: device.model,
              platform: device.platform,
              app_version: device.appVersion,
              language: device.language || 'ar',
              timezone: device.timezone,
              last_seen: device.lastSeen || new Date().toISOString(),
              is_active: device.isActive !== false,
              is_blocked: device.isBlocked === true,
              notes: device.notes,
              metadata: device.metadata || {},
            }, { onConflict: 'device_id' });

          if (!error) migrated++;
          else status.errors?.push(`Device ${device.deviceId}: ${error.message}`);
        } catch (e) {
          status.errors?.push(`Device ${device.deviceId}: ${String(e)}`);
        }
      }
    }

    status.recordsMigrated = migrated;
    status.isComplete = true;
    status.completedAt = new Date().toISOString();

    onProgress?.(`Migration complete! Migrated ${migrated} records.`);
    setMigrationStatus(status);

    return status;
  } catch (error) {
    status.errors?.push(`Migration failed: ${String(error)}`);
    onProgress?.(`Migration failed: ${String(error)}`);
    setMigrationStatus(status);
    return status;
  }
}

/**
 * Export current application data in a format that can be imported
 */
export function exportAppData() {
  // This would export all local data
  // Used for backup or sharing settings
  return {
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.6',
    // Add more data as needed
  };
}
