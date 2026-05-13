# Deployment & Production Readiness Guide

## Pre-Deployment Checklist

### Database Setup
- [ ] Database migrations applied (`20260513150000_sync_and_logs.sql`)
- [ ] All tables created successfully
- [ ] Row-level security (RLS) policies enabled
- [ ] Indexes created for performance
- [ ] Backup of production database created

### Code Changes
- [ ] All new modules imported in correct locations
- [ ] `startSupabaseSync()` called on app initialization
- [ ] Admin components integrated into Admin.tsx
- [ ] Language selector added to Settings page
- [ ] Error handling added to critical paths
- [ ] Environment variables configured

### Testing
- [ ] Offline transfer works
- [ ] Online sync completes successfully
- [ ] License generation works
- [ ] License activation works
- [ ] Admin dashboard renders all tabs
- [ ] 7-tap admin unlock works
- [ ] Language switching works
- [ ] Activation request flow works
- [ ] Admin can approve/reject requests

### Security
- [ ] Admin password changed from defaults
- [ ] Supabase API keys secured (publishable key in env)
- [ ] Private admin keys encrypted
- [ ] Database policies verified
- [ ] CORS configured correctly
- [ ] SSL/TLS enabled

### Performance
- [ ] Sync queue limits checked
- [ ] Retry logic configured
- [ ] Cache invalidation working
- [ ] Real-time updates functional
- [ ] No memory leaks in components
- [ ] Large dataset handling tested

---

## Deployment Steps

### Step 1: Apply Database Migrations
```bash
# Login to Supabase
supabase login

# Apply migrations
supabase migration up

# Or use Supabase dashboard directly
# Navigate to: SQL Editor > Run migrations
```

### Step 2: Verify Database Changes
```sql
-- Check new tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('sync_logs', 'error_logs', 'app_usage');

-- Verify RLS is enabled
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('sync_logs', 'error_logs', 'app_usage');
```

### Step 3: Update Application Code

#### 3a. App.tsx - Add Sync Initialization
```typescript
import { startSupabaseSync } from '@/lib/supabase-sync';

export function App() {
  useEffect(() => {
    // Initialize Supabase sync
    startSupabaseSync();
    
    // Track app open
    pushEvent('app_open', {
      appVersion: import.meta.env.VITE_APP_VERSION || '1.0.6'
    });
  }, []);
  
  return (
    // Your app JSX
  );
}
```

#### 3b. Admin.tsx - Update Imports
```typescript
// Add imports
import { DashboardOverview } from '@/components/admin/DashboardOverview';
import { DevicesManager } from '@/components/admin/DevicesManager';
import { LicensesManager } from '@/components/admin/LicensesManager';
import { ActivationsManager } from '@/components/admin/ActivationsManager';
import { SyncStatusMonitor } from '@/components/admin/SyncStatusMonitor';
import { TransfersViewer } from '@/components/admin/TransfersViewer';

// Update active tab type
type AdminTab = 'dashboard' | 'devices' | 'licenses' | 'activations' | 'transfers' | 'sync' | 'settings' | 'generate';

// Add tab buttons and content rendering
```

#### 3c. Settings.tsx - Add Language Selector
```typescript
import { setLanguage, getLanguage } from '@/lib/i18n';

// Add to settings UI
<div className="space-y-2">
  <label className="text-sm font-medium">Language</label>
  <select 
    value={getLanguage()} 
    onChange={(e) => setLanguage(e.target.value as 'ar' | 'en')}
    className="w-full p-2 border rounded"
  >
    <option value="ar">العربية</option>
    <option value="en">English</option>
  </select>
</div>
```

### Step 4: Build for Production
```bash
# Install dependencies
npm install

# Build for web
npm run build

# Build for Android
npm run build
# Then: npm exec -- cap copy android
# Then: npm exec -- cap open android (to build in Android Studio)
```

### Step 5: Deploy APK

#### Option A: Internal Testing
1. Connect Android device
2. Enable USB debugging
3. Run: `npm exec -- cap run android`

#### Option B: Google Play Store
1. Generate signed APK in Android Studio
2. Upload to Google Play Console
3. Roll out to testing track first
4. Monitor crash reports
5. Roll out to production (10% → 50% → 100%)

#### Option C: Direct APK Distribution
1. Build signed APK
2. Host on your server
3. Update auto-check endpoint
4. Test on multiple devices

---

## Testing Plan

### Unit Tests
```bash
# Run tests
npm run test

# Watch mode
npm run test:watch
```

### Integration Tests

#### Test 1: Offline Sync
1. Enable airplane mode on device
2. Perform a transfer
3. Verify transfer in local history
4. Disable airplane mode
5. Check sync logs in admin panel
6. Verify transfer synced to Supabase

#### Test 2: License Management
1. Generate 5 licenses in admin panel
2. Copy one license key
3. Go to Activation screen
4. Enter license key
5. Verify app activates
6. Check sync logs
7. Verify license marked as active in admin

#### Test 3: Admin Panel
1. Access admin panel (7-tap unlock)
2. Verify Dashboard loads metrics
3. Navigate through all tabs
4. Test search functionality
5. Test device blocking
6. Test license generation
7. Test activation approval flow

#### Test 4: Language Switching
1. Open Settings
2. Change language to English
3. Reload app
4. Verify language persisted
5. Go through all pages
6. Check all translations display correctly
7. Verify RTL/LTR switching works

#### Test 5: Activation Request Flow
1. Trigger trial expiration (set to 0 days)
2. Go to Activation page
3. Enter contact info
4. Generate activation request
5. Copy link
6. In admin panel, find pending request
7. Approve with expiry date
8. Copy generated license key
9. Use key to activate on device
10. Verify app works

### Load Testing
```bash
# Test with multiple concurrent syncs
// Simulate in local testing
pushEvent('transfer', { /* data */ }); // x100
await flush(); // Should handle 100 items
```

---

## Monitoring & Maintenance

### Daily Monitoring
1. Check error logs for exceptions
2. Review sync logs for failures
3. Monitor device registration rate
4. Check database query performance

### Weekly Monitoring
1. Review admin dashboard metrics
2. Check device activity patterns
3. Verify all licenses are functional
4. Review user feedback

### Monthly Maintenance
1. Clean up old sync logs (>30 days)
2. Analyze usage patterns
3. Optimize database queries
4. Update security policies
5. Review and archive licenses

### Database Maintenance
```sql
-- Archive old sync logs
DELETE FROM sync_logs 
WHERE created_at < NOW() - INTERVAL '30 days'
AND status = 'synced';

-- Vacuum database
VACUUM ANALYZE;

-- Check table sizes
SELECT 
  table_name,
  round(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.TABLES;
```

---

## Rollback Plan

### If Issues Occur

#### Immediate Rollback
1. Deploy previous APK version
2. Users update from store
3. Old sync logic continues

#### Database Rollback
```bash
# Revert to backup
supabase db push --dry-run # Preview changes
supabase db push # Apply

# Or restore from backup
# In Supabase dashboard: Settings > Backups > Restore
```

#### Partial Rollback
1. Disable new features in admin panel
2. Keep offline functionality working
3. Manually process sync queue

---

## Performance Tuning

### Sync Optimization
```typescript
// Adjust sync interval if needed
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Or adjust queue size
const MAX_QUEUE_SIZE = 500; // per device

// Modify in: src/lib/supabase-sync.ts
```

### Database Optimization
```sql
-- Add indexes for frequently queried fields
CREATE INDEX idx_transfers_device_time 
ON transfers(device_id, created_at DESC);

CREATE INDEX idx_licenses_device_status 
ON licenses(device_id, status);

-- Analyze query performance
EXPLAIN ANALYZE 
SELECT * FROM transfers 
WHERE device_id = 'xxx' 
ORDER BY created_at DESC 
LIMIT 100;
```

---

## Security Hardening

### Before Production

1. **Change Admin Password**
   ```
   Default: admin/admin123
   Change in Admin.tsx or via DB
   ```

2. **Verify RLS Policies**
   ```sql
   -- Check all policies are enabled
   SELECT schemaname, tablename, policyname 
   FROM pg_policies 
   WHERE schemaname = 'public';
   ```

3. **Rotate API Keys**
   - Generate new Supabase keys
   - Update in .env
   - Invalidate old keys

4. **Enable Database Encryption**
   - Supabase handles this automatically
   - Verify in project settings

5. **Setup Backups**
   - Enable automatic backups
   - Test restore procedure
   - Store backups securely

---

## Monitoring & Alerts

### Setup Alerts (via Supabase)

1. **Error Spike Alert**
   - Monitor error_logs table
   - Alert if >10 errors in 5 minutes

2. **Sync Failure Alert**
   - Monitor sync_logs table
   - Alert if failure rate >20%

3. **Device Registration Alert**
   - Monitor new device registrations
   - Alert if unusual spike

### Observability
```typescript
// Use browser console
localStorage.getItem('supabase_sync_queue_v1')     // See pending items
localStorage.getItem('supabase_sync_last_v1')      // See last sync time
```

---

## Production Checklist

### Before Going Live
- [ ] All tests passing
- [ ] Database migrations applied
- [ ] Code reviewed and deployed
- [ ] Admin panel fully functional
- [ ] 7-tap unlock tested
- [ ] Language switching works
- [ ] Offline sync tested
- [ ] License generation tested
- [ ] Activation flow tested
- [ ] Error logging working
- [ ] Backups configured
- [ ] Monitoring enabled
- [ ] Documentation updated
- [ ] Support team trained

### After Going Live
- [ ] Monitor error logs (24/7 first week)
- [ ] Response to issues <1 hour
- [ ] Collect user feedback
- [ ] Track key metrics
- [ ] Daily standup (first week)
- [ ] Post-mortem for any issues

---

## Post-Launch Support

### Support Resources
1. **Documentation**
   - User guide for customers
   - Admin guide for operations
   - API docs for developers

2. **Monitoring Dashboard**
   - Real-time metrics in admin panel
   - Historical data for analysis
   - Export capabilities

3. **Issue Tracking**
   - GitHub issues for bugs
   - Feature requests list
   - Priority system

---

## Version Updates

### Update Process
1. Develop new features in feature branch
2. Test thoroughly
3. Create pull request
4. Code review
5. Merge to main
6. Run test suite
7. Build new APK
8. Create release notes
9. Deploy to beta track
10. Gradual rollout (10% → 50% → 100%)

### Version Numbering
- Major: Large feature additions
- Minor: Small features, improvements
- Patch: Bug fixes, security updates

---

## Success Metrics

Track these KPIs:

1. **Adoption**
   - Daily active users
   - New user registrations
   - Devices synced

2. **Reliability**
   - Sync success rate (target: >99%)
   - Error rate (target: <1%)
   - Uptime (target: 99.9%)

3. **Performance**
   - Sync latency (target: <30s)
   - Admin dashboard load time
   - License validation time

4. **Business**
   - Active licenses
   - Conversion rate (trial → paid)
   - Customer satisfaction

---

**Deployment Guide Version**: 1.0
**Last Updated**: May 13, 2026
