# USSD Dialer Upgrade - API Reference Guide

## Core Modules API

### 1. Supabase Sync Module (`src/lib/supabase-sync.ts`)

**Purpose**: Handles automatic offline-first syncing to Supabase

#### Functions:

```typescript
// Start automatic sync (call once on app load)
startSupabaseSync(): void

// Push an event to sync queue
pushEvent(event: string, data: Record<string, unknown> = {}): void

// Manually trigger sync
flush(): Promise<{ sent: number; errors: number }>

// Check if sync is currently in progress
isSyncing(): boolean

// Get size of pending sync queue
getSupabaseQueueSize(): number

// Get timestamp of last successful sync
getLastSupabaseSync(): string | null

// Get cached remote license (if present)
getCachedRemoteLicense(): { license_key, status, expiry_date, permanent, ussd_numbers } | null

// Check if device is blocked
isDeviceBlocked(): boolean
```

**Example Usage**:
```typescript
import { pushEvent, startSupabaseSync, flush, getSupabaseQueueSize } from '@/lib/supabase-sync';

// Start syncing on app load
startSupabaseSync();

// Push transfer event
pushEvent('transfer', {
  phone: '+963912345678',
  amount: 50,
  operator: 'mtn',
  status: 'completed'
});

// Check queue size
const pending = getSupabaseQueueSize();
console.log(`${pending} items waiting to sync`);

// Manually trigger sync
const result = await flush();
console.log(`Synced ${result.sent} events with ${result.errors} errors`);
```

---

### 2. License System Module (`src/lib/license-system.ts`)

**Purpose**: Professional 12-character license key management

#### Functions:

```typescript
// Generate a single license key (format: AB12-CD34-EF56)
generateLicenseKey(): string

// Validate license key format
isValidLicenseFormat(key: string): boolean

// Generate multiple licenses for admin
adminGenerateLicenses(
  count: number,
  expiryDate: string | null,
  permanent: boolean,
  ussdNumbers?: string[]
): Promise<{ success: boolean; keys: string[]; error?: string }>

// Activate a license on the device
activateLicense(key: string): Promise<{ valid: boolean; error?: string }>

// Get locally cached license
getCachedLicense(): LicenseInfo | null

// Revoke a license (admin only)
revokeLicense(licenseKey: string): Promise<{ success: boolean; error?: string }>

// Extend license expiry (admin only)
extendLicense(licenseKey: string, newExpiryDate: string): Promise<{ success: boolean; error?: string }>

// Get all active licenses (admin only)
getAllActiveLicenses(): Promise<License[]>

// Get license statistics (admin only)
getLicenseStatistics(): Promise<{ total, active, expired, revoked, pending }>
```

**Example Usage**:
```typescript
import { 
  generateLicenseKey, 
  isValidLicenseFormat, 
  activateLicense,
  adminGenerateLicenses
} from '@/lib/license-system';

// Generate a single key
const key = generateLicenseKey();
console.log(key); // Example: "AB12-CD34-EF56"

// Validate format
if (isValidLicenseFormat(userInput)) {
  // Try to activate
  const result = await activateLicense(userInput);
  if (result.valid) {
    console.log('License activated!');
  }
}

// Admin: Generate bulk licenses
const result = await adminGenerateLicenses(
  10,           // count
  '2027-12-31', // expiry date
  false,        // not permanent
  ['0941111111', '0942222222'] // USSD numbers
);

if (result.success) {
  console.log('Generated keys:', result.keys);
}
```

---

### 3. Activation Request Module (`src/lib/activation-request.ts`)

**Purpose**: Handle trial expiration and activation request workflow

#### Functions:

```typescript
// Create activation request for expired trial
createActivationRequest(
  contactName?: string,
  contactPhone?: string,
  ussdNumbers?: string[]
): Promise<ActivationRequest | null>

// Generate unique request token
generateRequestToken(): string

// Get the shareable activation link
getActivationRequestLink(requestToken: string): string

// Get locally stored request
getLocalActivationRequest(): ActivationRequest | null

// Check if request has been approved
checkActivationStatus(requestToken: string): Promise<'pending' | 'approved' | 'rejected' | 'error'>

// Admin: Approve activation and create license
adminApproveActivation(
  requestToken: string,
  expiryDate: string,
  ussdNumbers?: string[]
): Promise<{ success: boolean; licenseKey?: string; error?: string }>

// Admin: Reject activation
adminRejectActivation(requestToken: string, reason?: string): Promise<{ success: boolean; error?: string }>

// Admin: Get pending requests
getPendingActivations(): Promise<Activation[]>

// Admin: Get statistics
getActivationStatistics(): Promise<{ total, pending, approved, rejected }>
```

**Example Usage**:
```typescript
import { 
  createActivationRequest, 
  getActivationRequestLink,
  adminApproveActivation 
} from '@/lib/activation-request';

// User: Create request when trial expires
const request = await createActivationRequest(
  'John Doe',
  '0991234567',
  ['0941111111']
);

if (request) {
  const link = getActivationRequestLink(request.requestToken);
  console.log('Share this link:', link);
  // Copy to clipboard or send via WhatsApp
}

// Admin: Approve request
const approval = await adminApproveActivation(
  'ABCDEF123456',
  '2027-12-31',
  ['0941111111']
);

if (approval.success) {
  console.log('Generated license:', approval.licenseKey);
}
```

---

### 4. Google Sheets Migration Module (`src/lib/sheets-migration.ts`)

**Purpose**: Migrate existing data from Google Sheets to Supabase

#### Functions:

```typescript
// Get current migration status
getMigrationStatus(): MigrationStatus

// Set migration status
setMigrationStatus(status: MigrationStatus): void

// Migrate data from Google Sheets
migrateFromGoogleSheets(
  sheetsScriptUrl: string,
  onProgress?: (message: string) => void
): Promise<MigrationStatus>

// Export current app data
exportAppData(): Object
```

**Example Usage**:
```typescript
import { migrateFromGoogleSheets, getMigrationStatus } from '@/lib/sheets-migration';

// Check if already migrated
const status = getMigrationStatus();
if (status.isComplete) {
  console.log(`Already migrated ${status.recordsMigrated} records`);
}

// Start migration
const result = await migrateFromGoogleSheets(
  'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
  (message) => {
    console.log('Migration progress:', message);
    toast.info(message);
  }
);

if (!result.isComplete) {
  result.errors?.forEach(err => console.error(err));
}
```

---

### 5. Internationalization Module (`src/lib/i18n.ts`)

**Purpose**: Multi-language support (Arabic/English)

#### Functions:

```typescript
// Change application language
setLanguage(lng: 'ar' | 'en'): void

// Get current language
getLanguage(): 'ar' | 'en'

// Use translations in components
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
const text = t('common.save'); // "Save" or "حفظ"
```

**Example Usage**:
```typescript
import { setLanguage, getLanguage } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';

export function LanguageSelector() {
  const current = getLanguage();
  
  return (
    <select value={current} onChange={(e) => setLanguage(e.target.value as 'ar' | 'en')}>
      <option value="ar">العربية</option>
      <option value="en">English</option>
    </select>
  );
}

export function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <div dir={current === 'ar' ? 'rtl' : 'ltr'}>
      <h1>{t('appName')}</h1>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

---

## Admin Dashboard Components API

All admin components are React components that fetch and display data from Supabase in real-time.

### DashboardOverview
```typescript
export function DashboardOverview(): JSX.Element
// Shows key metrics and statistics
// Refreshes every 30 seconds
```

### DevicesManager
```typescript
export function DevicesManager(): JSX.Element
// Manage devices
// Features: block/unblock, delete, search
```

### LicensesManager
```typescript
export function LicensesManager(): JSX.Element
// Manage licenses
// Features: generate, revoke, extend, copy keys
```

### ActivationsManager
```typescript
export function ActivationsManager(): JSX.Element
// Manage activation requests
// Features: approve, reject, set expiry
```

### SyncStatusMonitor
```typescript
export function SyncStatusMonitor(): JSX.Element
// Monitor sync status
// Features: real-time status, logs, manual sync
```

### TransfersViewer
```typescript
export function TransfersViewer(): JSX.Element
// View all transfers
// Features: search, date range filter, statistics
```

---

## Database Schema Reference

### Key Tables:

#### `licenses`
```sql
license_key: TEXT (unique) -- 12-character format
status: 'active' | 'expired' | 'revoked' | 'pending'
device_id: TEXT (foreign key)
expiry_date: DATE (optional, null for permanent)
permanent: BOOLEAN
ussd_numbers: TEXT[]
created_at: TIMESTAMPTZ
activated_at: TIMESTAMPTZ (optional)
```

#### `activations`
```sql
request_token: TEXT (unique) -- 16-character token
device_id: TEXT
status: 'pending' | 'approved' | 'rejected'
contact_name: TEXT (optional)
contact_phone: TEXT (optional)
ussd_numbers: TEXT[]
license_id: UUID (foreign key, set when approved)
created_at: TIMESTAMPTZ
processed_at: TIMESTAMPTZ (optional)
```

#### `devices`
```sql
device_id: TEXT (unique)
user_id: UUID (foreign key, optional)
is_active: BOOLEAN
is_blocked: BOOLEAN
last_seen: TIMESTAMPTZ
model: TEXT
platform: TEXT
app_version: TEXT
language: TEXT
```

#### `transfers`
```sql
device_id: TEXT (foreign key)
user_id: UUID (foreign key, optional)
phone: TEXT
amount: NUMERIC
operator: TEXT
status: TEXT -- 'completed', 'failed', 'pending'
created_at: TIMESTAMPTZ
synced_at: TIMESTAMPTZ
```

#### `sync_logs`
```sql
device_id: TEXT
event_type: TEXT
status: 'synced' | 'failed' | 'pending'
records_count: INTEGER
error_message: TEXT (optional)
created_at: TIMESTAMPTZ
```

---

## Common Patterns

### Pattern 1: Track User Activity
```typescript
import { pushEvent } from '@/lib/supabase-sync';

async function handleTransfer(phone: string, amount: number, operator: string) {
  try {
    // Perform transfer...
    
    // Track the event
    pushEvent('transfer', {
      phone,
      amount,
      operator,
      status: 'completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    pushEvent('transfer', {
      phone,
      amount,
      operator,
      status: 'failed',
      error: error.message
    });
  }
}
```

### Pattern 2: Handle Trial Expiration
```typescript
import { createActivationRequest, getActivationRequestLink } from '@/lib/activation-request';

if (status.status === 'trial_expired') {
  const request = await createActivationRequest(
    undefined, // optional contact name
    undefined, // optional contact phone
    ussdNumbers
  );
  
  if (request) {
    const link = getActivationRequestLink(request.requestToken);
    // Show link to user for sharing
  }
}
```

### Pattern 3: Admin License Generation
```typescript
import { adminGenerateLicenses } from '@/lib/license-system';

const count = 10;
const expiryDate = '2027-12-31';
const result = await adminGenerateLicenses(
  count,
  expiryDate,
  false, // not permanent
  [] // ussd numbers to assign
);

if (result.success) {
  // Download keys or send via email
  downloadKeys(result.keys);
}
```

### Pattern 4: Migration
```typescript
import { migrateFromGoogleSheets } from '@/lib/sheets-migration';

// In admin settings
const result = await migrateFromGoogleSheets(
  'https://script.google.com/macros/s/YOUR_ID/exec',
  (msg) => {
    console.log(msg);
    setProgress(msg);
  }
);

if (result.isComplete) {
  toast.success(`Migrated ${result.recordsMigrated} records`);
} else {
  result.errors?.forEach(err => toast.error(err));
}
```

---

## Environment Setup

### Required Environment Variables
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

### Optional Configuration
```env
# For production
VITE_APP_VERSION=1.0.6
VITE_API_TIMEOUT=10000
```

---

## Troubleshooting & Error Handling

All async functions use try-catch internally. Always await and check for errors:

```typescript
const result = await activateLicense(key);
if (!result.valid) {
  console.error('Activation failed:', result.error);
  // Show error to user
}
```

For detailed error logging:
```typescript
import { logError } from '@/lib/supabase-sync';

try {
  // Your operation
} catch (error) {
  await logError(
    'operation_type',
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
    { context: 'additional info' }
  );
}
```

---

**Last Updated**: May 13, 2026
**API Version**: 1.0
