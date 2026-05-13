# USSD Dialer Upgrade - Quick Integration Guide

## Step 1: Update App.tsx - Enable Auto Sync

Add this to your main App component to start automatic Supabase syncing:

```typescript
// At the top of App.tsx
import { startSupabaseSync } from '@/lib/supabase-sync';

// Inside your main App component
useEffect(() => {
  // Start automatic Supabase sync
  startSupabaseSync();
  
  // Log app open event
  pushEvent('app_open', {
    appVersion: '1.0.6',
    timestamp: new Date().toISOString(),
  });
}, []);
```

## Step 2: Update Activation.tsx - Already Updated ✓

The Activation page has been fully updated to support:
- Trial expiration with progress bar
- Activation request link generation
- 7-tap hidden admin login
- English language support

No additional changes needed.

## Step 3: Update Admin.tsx - Add New Dashboard Components

Replace the admin tab type and add new component imports:

```typescript
// Updated tab types
type AdminTab = 'dashboard' | 'devices' | 'licenses' | 'activations' | 'transfers' | 'sync' | 'generate' | 'settings';

// Add these imports at the top
import { DashboardOverview } from '@/components/admin/DashboardOverview';
import { DevicesManager } from '@/components/admin/DevicesManager';
import { LicensesManager } from '@/components/admin/LicensesManager';
import { ActivationsManager } from '@/components/admin/ActivationsManager';
import { SyncStatusMonitor } from '@/components/admin/SyncStatusMonitor';
import { TransfersViewer } from '@/components/admin/TransfersViewer';
```

Add tabs to your admin UI (replace existing tab buttons):

```typescript
<div className="flex gap-2 mb-6 overflow-x-auto pb-2">
  <Button
    onClick={() => setActiveTab('dashboard')}
    variant={activeTab === 'dashboard' ? 'default' : 'outline'}
  >
    Dashboard
  </Button>
  <Button
    onClick={() => setActiveTab('devices')}
    variant={activeTab === 'devices' ? 'default' : 'outline'}
  >
    Devices
  </Button>
  <Button
    onClick={() => setActiveTab('licenses')}
    variant={activeTab === 'licenses' ? 'default' : 'outline'}
  >
    Licenses
  </Button>
  <Button
    onClick={() => setActiveTab('activations')}
    variant={activeTab === 'activations' ? 'default' : 'outline'}
  >
    Activations
  </Button>
  <Button
    onClick={() => setActiveTab('transfers')}
    variant={activeTab === 'transfers' ? 'default' : 'outline'}
  >
    Transfers
  </Button>
  <Button
    onClick={() => setActiveTab('sync')}
    variant={activeTab === 'sync' ? 'default' : 'outline'}
  >
    Sync Status
  </Button>
  <Button
    onClick={() => setActiveTab('settings')}
    variant={activeTab === 'settings' ? 'default' : 'outline'}
  >
    Settings
  </Button>
</div>
```

Add tab content section:

```typescript
{/* Tab Content */}
{authenticated && (
  <div className="space-y-6">
    {activeTab === 'dashboard' && <DashboardOverview />}
    {activeTab === 'devices' && <DevicesManager />}
    {activeTab === 'licenses' && <LicensesManager />}
    {activeTab === 'activations' && <ActivationsManager />}
    {activeTab === 'transfers' && <TransfersViewer />}
    {activeTab === 'sync' && <SyncStatusMonitor />}
    {activeTab === 'settings' && (
      // Keep existing settings tab content
      <div>
        {/* Existing settings UI */}
      </div>
    )}
  </div>
)}
```

## Step 4: Update Settings Page - Add Language Selector

In your `Settings.tsx` page:

```typescript
import { setLanguage, getLanguage } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';

export function Settings() {
  const { t } = useTranslation();
  const [language, setLanguageState] = useState(getLanguage());

  const handleLanguageChange = (newLang: 'ar' | 'en') => {
    setLanguage(newLang);
    setLanguageState(newLang);
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <label className="text-sm font-medium block mb-2">
          {t('settings.language')}
        </label>
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value as 'ar' | 'en')}
          className="w-full p-2 border rounded"
        >
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  );
}
```

## Step 5: Enable Google Sheets Migration

Create a migration utility function:

```typescript
// In your admin settings or migration component
import { migrateFromGoogleSheets } from '@/lib/sheets-migration';

async function handleMigration() {
  const sheetsScriptUrl = 'YOUR_GOOGLE_APPS_SCRIPT_URL';
  
  await migrateFromGoogleSheets(
    sheetsScriptUrl,
    (message) => {
      console.log(message);
      toast.info(message);
    }
  );
}
```

## Step 6: Update Transfer Tracking

When performing transfers, track them:

```typescript
import { pushEvent } from '@/lib/supabase-sync';

// After successful transfer
pushEvent('transfer', {
  phone,
  amount,
  operator,
  status: 'completed',
  timestamp: new Date().toISOString(),
});
```

## Step 7: Track License Activation

When a license is activated:

```typescript
import { pushEvent } from '@/lib/supabase-sync';
import { activateLicense } from '@/lib/license-system';

const result = await activateLicense(licenseKey);

if (result.valid) {
  pushEvent('license_activated', {
    licenseKey,
    timestamp: new Date().toISOString(),
  });
}
```

## Step 8: Handle Trial Expiration

Already integrated into Activation page, but to create requests:

```typescript
import { createActivationRequest } from '@/lib/activation-request';

// When trial expires, offer to create request
const request = await createActivationRequest(
  contactName,
  contactPhone,
  ussdNumbers
);

if (request) {
  const link = getActivationRequestLink(request.requestToken);
  // Show link to user
}
```

## Step 9: Error Logging (Optional but Recommended)

```typescript
import { logError } from '@/lib/supabase-sync';

try {
  // Your code
} catch (error) {
  logError(
    'operation_name',
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
    { operation: 'name', context: 'details' }
  );
}
```

## Step 10: Run Database Migrations

```bash
# In your project directory
supabase migration up

# Or via Supabase CLI
supabase db pull  # If you want to sync with cloud
```

## Verification Checklist

After integration, verify:

- [ ] App syncs data when online
- [ ] Admin dashboard loads without errors
- [ ] Can generate licenses
- [ ] Can approve activations
- [ ] Can block devices
- [ ] Languages switch properly
- [ ] 7-tap admin unlock works
- [ ] Sync logs appear
- [ ] Transfers tracked
- [ ] Offline transfers work

## Troubleshooting

### Sync not working?
- Check browser console for errors
- Verify Supabase credentials in `.env`
- Check network connectivity
- Look at sync logs in admin panel

### Admin components not rendering?
- Ensure all components are exported correctly
- Check component imports
- Verify Supabase client is initialized

### Language not changing?
- Clear browser cache
- Check localStorage
- Verify i18n configuration

### Database migration errors?
- Check Supabase CLI version
- Ensure you're logged in to Supabase
- Verify SQL syntax in migration file

## Support & Documentation

For more details, see:
- `UPGRADE_IMPLEMENTATION_SUMMARY.md` - Complete feature overview
- `src/lib/` - Individual module documentation
- `src/components/admin/` - Component usage examples
