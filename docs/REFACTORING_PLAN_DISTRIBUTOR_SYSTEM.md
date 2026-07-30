# Distributor Management System - Complete Refactoring Plan

## Overview

This plan completely replaces the existing distributor system with a clean, production-grade architecture built on Supabase (PostgreSQL + RLS + Edge Functions + Realtime). The legacy localStorage-based system is fully removed.

---

## Phase 1: Database Schema & Migrations

### 1.1 Files to Delete
- `supabase/migrations/20260727000000_distributor_management_system.sql` (replaced entirely)
- `supabase/migrations/20260513144842_e773593a-8741-4d0d-911a-d89134819dbb.sql` (remove distributor tables; keep roles, profiles, devices, licenses, transfers, etc.)
- `supabase/migrations/20260513144903_d49f7dfb-3af8-4678-aa05-5de404cad200.sql`
- `supabase/migrations/20260513150000_sync_and_logs.sql` (remove distributor parts)
- Any other migration that adds distributor-specific tables no longer needed

### 1.2 New Migration: `20260801000000_distributor_system.sql`

Single comprehensive migration that:

#### Enums
```sql
-- Extend app_role if needed (already has distributor)
-- Add customer_status enum if not exists
CREATE TYPE customer_status AS ENUM ('active', 'blocked', 'suspended', 'on_hold');
-- Add transaction_type enum  
CREATE TYPE transaction_type AS ENUM ('topup', 'payment', 'debt', 'credit', 'adjustment', 'opening_balance', 'closing_balance', 'manual_correction');
-- Add payment_method enum
CREATE TYPE payment_method AS ENUM ('cash', 'bank', 'wallet', 'adjustment');
-- Add transfer_status enum
CREATE TYPE transfer_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'cancelled');
-- Add commission_type enum
CREATE TYPE commission_type AS ENUM ('percentage', 'fixed', 'hybrid');
-- Add account_status enum
CREATE TYPE account_status AS ENUM ('active', 'inactive', 'closed');
```

#### Tables

**`distributors`** (replaces old device-centric table)
- `id` UUID PK
- `user_id` UUID FK -> profiles.user_id (unique)
- `business_name` TEXT
- `phone` TEXT
- `email` TEXT
- `city` TEXT
- `address` TEXT
- `status` TEXT DEFAULT 'active'
- `commission_type` commission_type DEFAULT 'percentage'
- `commission_value` NUMERIC DEFAULT 0
- `commission_min` NUMERIC DEFAULT 0
- `commission_max` NUMERIC
- `total_customers` INTEGER DEFAULT 0
- `total_transfers` NUMERIC DEFAULT 0
- `total_revenue` NUMERIC DEFAULT 0
- `total_commission` NUMERIC DEFAULT 0
- `license_id` UUID FK -> licenses.id
- `device_id` TEXT (legacy, kept for migration compatibility)
- `created_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ

**`customers`** (replaces profiles as customer records)
- `id` UUID PK
- `user_id` UUID FK -> profiles.user_id (unique)
- `display_name` TEXT NOT NULL
- `display_name_en` TEXT
- `phone` TEXT
- `email` TEXT
- `shop_name` TEXT
- `city` TEXT
- `address` TEXT
- `notes` TEXT
- `status` customer_status DEFAULT 'active'
- `distributor_id` UUID FK -> distributors.id
- `license_id` UUID FK -> licenses.id
- `created_at` TIMESTAMPTZ
- `created_by` UUID FK -> profiles.user_id
- `updated_at` TIMESTAMPTZ
- `last_transfer_at` TIMESTAMPTZ
- `last_transfer_amount` NUMERIC

**`customer_accounts`**
- `id` UUID PK
- `customer_id` UUID FK -> customers.id (unique)
- `current_balance` NUMERIC DEFAULT 0
- `current_debt` NUMERIC DEFAULT 0
- `credit_limit` NUMERIC DEFAULT 0
- `available_credit` NUMERIC GENERATED ALWAYS AS (credit_limit - current_debt) STORED
- `opening_balance` NUMERIC DEFAULT 0
- `closing_balance` NUMERIC DEFAULT 0
- `total_transfers` NUMERIC DEFAULT 0
- `total_payments` NUMERIC DEFAULT 0
- `total_commissions` NUMERIC DEFAULT 0
- `total_debt_added` NUMERIC DEFAULT 0
- `total_credit_added` NUMERIC DEFAULT 0
- `total_adjustments` NUMERIC DEFAULT 0
- `pending_transfers_amount` NUMERIC DEFAULT 0
- `last_transfer_at` TIMESTAMPTZ
- `last_payment_at` TIMESTAMPTZ
- `account_status` account_status DEFAULT 'active'
- `created_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ

**`network_accounts`** (customer phone lines per operator)
- `id` UUID PK
- `customer_id` UUID FK -> customers.id ON DELETE CASCADE
- `operator` TEXT NOT NULL ('syriatel', 'mtn')
- `phone` TEXT NOT NULL
- `ussd_codes` JSONB DEFAULT '{}'
- `transfer_codes` JSONB DEFAULT '{}'
- `prefixes` JSONB DEFAULT '[]'
- `secret_codes` JSONB DEFAULT '{}'
- `transfer_formats` JSONB DEFAULT '{}'
- `fallback_codes` JSONB DEFAULT '[]'
- `is_default` BOOLEAN DEFAULT false
- `created_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ
- UNIQUE (customer_id, operator, phone)

**`customer_network_codes`** (USSD/transfer code templates per customer per operator)
- `id` UUID PK
- `customer_id` UUID FK -> customers.id ON DELETE CASCADE
- `operator` TEXT NOT NULL
- `code_type` TEXT NOT NULL ('ussd', 'transfer', 'prefix', 'secret', 'fallback')
- `code_value` TEXT NOT NULL
- `label` TEXT
- `is_active` BOOLEAN DEFAULT true
- `sort_order` INTEGER DEFAULT 0
- `created_at` TIMESTAMPTZ
- UNIQUE (customer_id, operator, code_type, code_value)

**`transfers`** (balance transfer records)
- `id` UUID PK
- `customer_id` UUID FK -> customers.id
- `distributor_id` UUID FK -> distributors.id
- `operator` TEXT NOT NULL
- `amount` NUMERIC NOT NULL
- `commission_type` commission_type
- `commission_value` NUMERIC
- `commission_amount` NUMERIC DEFAULT 0
- `net_amount` NUMERIC GENERATED ALWAYS AS (amount - COALESCE(commission_amount, 0)) STORED
- `phone` TEXT
- `ussd_template` TEXT
- `status` transfer_status DEFAULT 'pending'
- `device_id` TEXT
- `reference_number` TEXT
- `notes` TEXT
- `created_by` UUID FK -> profiles.user_id
- `created_at` TIMESTAMPTZ
- `sent_at` TIMESTAMPTZ
- `delivered_at` TIMESTAMPTZ
- `completed_at` TIMESTAMPTZ
- `cancelled_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ

**`payments`** (financial payments from customers)
- `id` UUID PK
- `customer_id` UUID FK -> customers.id
- `distributor_id` UUID FK -> distributors.id
- `amount` NUMERIC NOT NULL
- `method` payment_method NOT NULL
- `reference` TEXT
- `notes` TEXT
- `status` TEXT DEFAULT 'confirmed'
- `created_by` UUID FK -> profiles.user_id
- `created_at` TIMESTAMPTZ
- `confirmed_at` TIMESTAMPTZ

**`commissions`** (commission tracking per transfer)
- `id` UUID PK
- `transfer_id` UUID FK -> transfers.id
- `customer_id` UUID FK -> customers.id
- `distributor_id` UUID FK -> distributors.id
- `amount` NUMERIC NOT NULL
- `type` commission_type NOT NULL
- `value` NUMERIC NOT NULL
- `calculated_amount` NUMERIC NOT NULL
- `notes` TEXT
- `created_at` TIMESTAMPTZ

**`audit_logs`** (already exists, extend)
- Add `ip` TEXT
- Add `device_id` TEXT
- Ensure all distributor operations are logged

### 1.3 Indexes
```sql
CREATE INDEX idx_customers_distributor ON customers(distributor_id);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_network_accounts_customer ON network_accounts(customer_id);
CREATE INDEX idx_network_accounts_operator ON network_accounts(operator);
CREATE INDEX idx_transfers_customer ON transfers(customer_id);
CREATE INDEX idx_transfers_distributor ON transfers(distributor_id, status);
CREATE INDEX idx_transfers_date ON transfers(created_at DESC);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(created_at DESC);
```

### 1.4 Views

**`v_customer_summary`** - Materialized view for dashboard stats
**`v_distributor_stats`** - Per-distributor summary
**`v_daily_summary`** - Aggregate daily metrics

### 1.5 Triggers
- `updated_at` trigger on all tables
- Auto-update `customer_accounts` on transfer/payment insert
- Auto-update `distributors.total_customers` on customer assignment
- Auto-generate `reference_number` on transfer insert

### 1.6 Cleanup Old Objects
- Drop old `distributors` table (device-centric)
- Drop old `distributor_transactions` table
- Drop old `distributor_customers` table
- Drop old `customer_accounts` table (new schema replaces)
- Drop old `customer_transactions` table
- Drop old `topup_requests` table
- Drop old `get_distributor_id_for_user()` function
- Drop old `set_topup_request_completed_at()` trigger
- Drop old `trg_topup_requests_completed_at` trigger
- Drop old RLS policies for old tables

---

## Phase 2: Edge Functions & RPC

### 2.1 New Edge Function: `distributor-rpc` (rewrite)

Rewrite `supabase/functions/distributor-rpc/index.ts` completely.

**Architecture:**
- Whitelist all new RPC functions
- Verify caller authentication
- Verify role (admin/distributor/customer as appropriate)
- For distributor callers: validate customer assignment
- For customer callers: validate self-access only
- Set `created_by` / `actor_user_id` automatically
- Return standardized JSON response format
- CORS handling preserved

**Whitelisted Functions:**
Every RPC defined in Phase 1

### 2.2 New Edge Function: `device-sync` (enhance)

Enhance existing `device-sync` function to handle:
- Distributor-specific sync events
- Transfer queue items
- Offline operations replay

### 2.3 RPC Functions (all SECURITY DEFINER)

**Customer Management:**
- `customer_register(...)` - Register as customer during signup
- `customer_get_profile(...)` - Get own customer profile
- `customer_update_profile(...)` - Update own profile
- `distributor_get_customers(...)` - Distributor views assigned customers
- `distributor_get_customer_detail(...)` - Full customer detail
- `admin_get_all_customers(...)` - Admin sees all customers
- `admin_assign_customer(...)` - Admin assigns customer to distributor
- `admin_update_customer_status(...)` - Admin changes customer status
- `admin_update_customer_notes(...)` - Admin updates notes
- `distributor_update_customer_notes(...)` - Distributor updates notes

**Transfer Operations:**
- `distributor_create_transfer(...)` - Distributor initiates transfer
- `distributor_execute_transfer(...)` - Execute USSD + record transfer
- `customer_get_transfers(...)` - Customer views own transfers
- `distributor_get_transfers(...)` - Distributor views transfer history

**Accounting:**
- `distributor_add_debt(...)` - Add debt to customer
- `distributor_register_payment(...)` - Register payment
- `distributor_adjust_credit(...)` - Adjust credit
- `distributor_adjust_debit(...)` - Adjust debit
- `distributor_record_opening_balance(...)` - Set opening balance
- `distributor_record_closing_balance(...)` - Set closing balance
- `distributor_manual_correction(...)` - Manual correction

**Network Codes:**
- `distributor_set_network_codes(...)` - Save USSD/transfer codes for customer
- `distributor_get_network_codes(...)` - Retrieve codes for customer
- `distributor_update_default_line(...)` - Set default line

**Reports:**
- `distributor_dashboard_stats(...)` - Distributor dashboard metrics
- `distributor_customer_transactions(...)` - Customer transaction history
- `distributor_customer_statement(...)` - Full account statement
- `admin_get_reports(...)` - Admin reports aggregator

**System:**
- `admin_list_distributors(...)` - List all distributors
- `admin_set_user_role(...)` - Change user role (admin only)
- `admin_update_license(...)` - Manage license for distributor account

### 2.4 RLS Policies

**profiles:**
- Admin: ALL
- Distributor: SELECT own profile only
- Customer: SELECT/UPDATE own profile only

**distributors:**
- Admin: ALL
- Distributor: SELECT/UPDATE own row (user_id = auth.uid())
- Customer: No access

**customers:**
- Admin: ALL
- Distributor: SELECT/INSERT/UPDATE customers where distributor_id = own id
- Customer: SELECT own customer row only

**customer_accounts:**
- Admin: ALL
- Distributor: SELECT WHERE customer_id IN (own customers)
- Customer: SELECT own account only

**network_accounts:**
- Admin: ALL
- Distributor: WHERE customer_id IN (own customers)
- Customer: WHERE customer_id = own id

**customer_network_codes:**
- Same as network_accounts

**transfers:**
- Admin: ALL
- Distributor: WHERE distributor_id = own id
- Customer: WHERE customer_id = own id

**payments:**
- Admin: ALL
- Distributor: WHERE distributor_id = own id
- Customer: WHERE customer_id = own id

**commissions:**
- Admin: ALL
- Distributor: WHERE distributor_id = own id

**audit_logs:**
- Admin: ALL
- Distributor: INSERT only (own actions)
- Customer: No access

**Realtime Subscriptions:**
- channels: `distributor:{distributor_id}:transfers`
- channels: `distributor:{distributor_id}:customers`

---

## Phase 3: Client-Side Architecture

### 3.1 Files to Delete
- `src/lib/distributor.ts` (legacy localStorage)
- `src/lib/distributor-management.ts` (broken RPC calls)
- `src/lib/balance-tracking.ts` (legacy localStorage)
- `src/pages/Distributor.tsx` (legacy page)
- `src/pages/Balance.tsx` (old balance page - replace with integrated version)
- `src/components/distributor/TopupRequests.tsx` (old component)
- `src/components/distributor/DistributorTopupRequests.tsx` (old component)
- `src/components/distributor/DistributorAccountStatement.tsx` (old component)
- `src/components/distributor/DistributorCustomerList.tsx` (old component)
- `src/components/distributor/DistributorCustomerDetail.tsx` (old version)
- `src/components/distributor/CustomerList.tsx` (old version)
- `src/components/distributor/CustomerDetail.tsx` (old version)
- `src/components/admin/DistributorsManager.tsx` (old version)
- `src/components/admin/AdminDistributorsManager.tsx` (old version - replace)
- `src/pages/distributor/DistributorDashboard.tsx` (broken - calls undefined function)
- `src/pages/distributor/DistributorCustomers.tsx`
- `src/pages/distributor/DistributorCustomerDetail.tsx`
- `src/pages/distributor/DistributorRequests.tsx`

### 3.2 New Files to Create

**Types & Interfaces:**
```
src/types/distributor.ts
  - Customer interface
  - NetworkAccount interface  
  - Transfer interface
  - Payment interface
  - Commission interface
  - AccountStatement interface
  - DashboardStats interface
  - Report interfaces
  - AuditLogEntry interface
```

**Services (all call Edge Functions):**
```
src/services/distributor/
  index.ts              - Service barrel export
  auth.ts               - Role-based auth checks with license validation
  customer-service.ts   - CRUD for customers via RPC
  transfer-service.ts   - Transfer operations via RPC
  accounting-service.ts - Debt/payment/adjustment via RPC
  network-service.ts    - Network code management via RPC
  report-service.ts     - Report data via RPC
  audit-service.ts      - Audit log queries
  offline-service.ts    - Offline queue + sync management
```

**Hooks:**
```
src/hooks/
  use-distributor.ts     - Distributor-specific hooks (stats, customers, transfers)
  use-customer.ts        - Customer data hooks
  use-transfers.ts       - Transfer hooks with realtime
  use-accounting.ts      - Accounting hooks
  use-reports.ts         - Report hooks
  use-offline.ts         - Offline sync hooks
  use-realtime.ts        - Realtime subscription hooks
```

**Layout Components:**
```
src/components/layout/
  DistributorLayout.tsx   - Full distributor app layout (sidebar + header)
  CustomerLayout.tsx      - Customer app layout
  DistributorNav.tsx      - Distributor navigation sidebar
  DistributorHeader.tsx   - Distributor top bar
```

**Pages (Distributor):**
```
src/pages/distributor/
  DistributorHome.tsx           - Transfer Balance (first screen)
  DistributorCustomersPage.tsx  - Customer management
  DistributorCustomerDetailPage.tsx - Customer detail + accounting
  DistributorTransfersPage.tsx  - Transfer history
  DistributorPaymentsPage.tsx   - Payment tracking
  DistributorReportsPage.tsx    - Reports & dashboard
  DistributorStatementPage.tsx  - Account statements
  DistributorSettingsPage.tsx   - Distributor profile/settings
```

---

## Phase 4: Distributor Home - Transfer Balance

### 4.1 UI Layout
The first screen after login for distributors is the transfer screen:

```
┌─────────────────────────────────┐
│  Header: "Transfer Balance"     │
├─────────────────────────────────┤
│  Customer Search / Selector     │
│  ┌─────────────────────────────┐│
│  │ Search by name/phone/shop  ││
│  │ [Search]                    ││
│  └─────────────────────────────┘│
│                                 │
│  Selected Customer Card:        │
│  - Name, Shop, Phone            │
│  - Current Balance: X SYP       │
│  - Current Debt: Y SYP          │
│  - Available Credit: Z SYP      │
│                                 │
│  Operator Selection:            │
│  [Syriatel] [MTN]               │
│                                 │
│  Amount: [________] SYP         │
│  Commission: [X% / Y SYP]       │
│  (Auto-calculated)              │
│                                 │
│  Notes: [________________]      │
│                                 │
│  ┌─────────────────────────────┐│
│  │    TRANSFER                 ││
│  └─────────────────────────────┘│
│                                 │
│  Quick Actions:                 │
│  - Add Debt                     │
│  - Register Payment             │
│  - Adjust Balance               │
│  - View Customer                │
│  - View Reports                 │
└─────────────────────────────────┘
```

### 4.2 Transfer Flow
1. User selects customer (search or list)
2. User selects operator (Syriatel/MTN)
3. User enters amount
4. Commission auto-calculated based on customer settings
5. Net amount displayed
6. User adds notes (optional)
7. User clicks "Transfer"
8. Edge Function validates license + distributor assignment
9. Edge Function sends USSD via device
10. If USSD success:
    - Transfer recorded with status 'delivered'
    - Customer balance increased
    - Commission calculated and recorded
    - Payment record created for the distributor
    - Realtime update broadcast
    - Dashboard stats updated
11. If USSD failure:
    - Transfer recorded with status 'failed'
    - Error logged in audit
    - User can retry
12. Transfer added to offline queue for sync

---

## Phase 5: Customer Management

### 5.1 Customer List Page
- Searchable table (name, phone, shop, city, status)
- Status badges (active/blocked/suspended/on_hold)
- Balance and debt columns
- Last transfer date
- Quick actions (view, edit, add transfer, accounting)
- Pagination (server-side)
- Filter by city, status, distributor

### 5.2 Add Customer Wizard
5-step wizard:
1. **Basic Info**: Display name, English name, phone, email, shop name, city, address
2. **Network Lines**: Add Syriatel/MTN phone numbers per line
3. **Network Codes**: USSD codes, transfer formats, prefixes, secret codes per operator
4. **Commission**: Type (percentage/fixed/hybrid), value, min, max
5. **Credit**: Credit limit, review all data, save

### 5.3 Customer Detail Page
- Profile info (editable)
- Balance cards (balance, debt, credit limit, available, pending)
- Quick accounting buttons
- Accounting form (add debt / payment / adjustment / credit)
- Network lines management
- Transfer history
- Payment history
- Account statement view
- Notes editor
- Audit log for this customer

### 5.4 Customer Account Statement
Professional report with:
- Opening balance (date range)
- All transfers (date, operator, amount, commission, net, status)
- All payments (date, method, amount, reference)
- All accounting entries (debt, credit, adjustment)
- Closing balance
- Filters: date range, operator, type
- Export: PDF, CSV, Excel, Print

---

## Phase 6: Accounting System

### 6.1 Accounting Operations
All operations go through Edge Functions for security:

| Operation | Effect on Account |
|-----------|-------------------|
| Add Debt | Increases `current_debt` |
| Register Payment | Decreases `current_debt` (min 0), increases `total_payments` |
| Credit Adjustment | Increases `current_balance` |
| Debit Adjustment | Decreases `current_balance` |
| Manual Correction | Adjusts both balance and debt with reason |
| Opening Balance | Sets initial balance for new period |
| Closing Balance | Records period end balance |

### 6.2 Audit Trail
Every accounting operation logs:
- Operation type
- Amount before/after
- Old balance / new balance
- Old debt / new debt
- Notes / reason
- User who performed
- Device & IP
- Timestamp

---

## Phase 7: Reports & Dashboard

### 7.1 Distributor Dashboard (non-traditional)
Quick stats bar at top of Transfer page:
- Today's Transfers (count + total amount)
- Today's Revenue (net)
- Today's Commission
- Pending Payments (count)
- Outstanding Debt (total)
- Active Customers (count)

### 7.2 Reports Page (Tabbed)
1. **Today**: Today's transfers, revenue, commission, payments
2. **Period Report**: Custom date range, filterable
3. **Customer Report**: Per-customer breakdown
4. **Financial Report**: Cash flow, debt, payments, commissions
5. **Operator Report**: Per-operator statistics
6. **Monthly Report**: Monthly aggregates

### 7.3 Report Features
- Date range picker
- Operator filter
- City filter
- Distributor filter
- Customer status filter
- Amount range filter
- Export to PDF
- Export to CSV
- Export to Excel
- Print view
- Chart visualizations (using existing chart components)

---

## Phase 8: Offline Sync Integration

### 8.1 Offline Queue
- Transfer operations queued locally when offline
- Queue persists in IndexedDB (not localStorage for business data)
- Sync on reconnection
- Conflict resolution: server-wins with client notification

### 8.2 Realtime Updates
- Supabase Realtime subscriptions on:
  - transfers (distributor's own transfers)
  - customers (assigned customers)
  - customer_accounts (balance changes)
  - payments (payment confirmations)
- Dashboard widgets update in realtime
- Transfer status updates propagate instantly

### 8.3 Background Sync
- Periodic sync interval (configurable, default 30s)
- On app foreground: immediate sync flush
- On network reconnect: immediate sync flush
- Sync progress indicator
- Failed operations retry with exponential backoff

---

## Phase 9: UI/UX Design System

### 9.1 Layout Change Based on Role
```
Customer Layout: Existing layout (unchanged)
Distributor Layout: New sidebar + header layout

Sidebar items:
  - Transfer (home)
  - Customers
  - Transfers (history)
  - Payments
  - Reports
  - Statements
  - Account Settings
```

### 9.2 Design Tokens
Reuse existing design tokens:
- Colors, typography, spacing, shadows
- RTL layout throughout
- Light/Dark mode support
- Responsive breakpoints
- Component library (shadcn/ui)

### 9.3 Arabic/English
- All UI text follows existing i18n pattern
- Arabic is primary (RTL)
- English is secondary (LTR within Arabic layout)
- All new text added to i18n files

---

## Phase 10: Testing Plan

### 10.1 Unit Tests
- RPC function parameter validation
- Commission calculation edge cases
- Balance arithmetic (overflow, negative, zero)
- RLS policy evaluation logic
- Offline queue operations
- Realtime subscription handling

### 10.2 Integration Tests
- Full transfer flow (create → execute → record)
- Accounting operations end-to-end
- Customer creation wizard completion
- Report generation with filters
- License validation at each RPC call

### 10.3 E2E Tests
- Complete customer lifecycle (register → add codes → transfer → account)
- Distributor full workflow
- Admin management workflow
- Role-based access control

### 10.4 Build Validation
- `npm run build` must pass
- `npm run lint` must pass
- `npm run typecheck` must pass
- No TypeScript errors
- No ESLint warnings

---

## Phase 11: Migration & Data Strategy

### 11.1 Data Migration
- Old `profiles` with `role='distributor'` → new `distributors` table
- Old `profiles` with `role='customer'` → new `customers` table
- Old `topup_requests` data → `transfers` table (status mapping)
- Old `distributor_transactions` → reconcile with new `transfers`/`payments`
- Customer network numbers (stored in existing `ussd_codes` or `profiles.phone`)

### 11.2 Backward Compatibility
- Existing login/auth flow unchanged
- License system unchanged
- Device binding unchanged
- USSD dialing unchanged
- Transfer history preserved
- All existing reports maintained

### 11.3 Rollback Plan
- Keep old migration files (no deletion until verified)
- Database backup before migration
- Feature flag to switch between old/new system
- Manual rollback script available

---

## Implementation Order

1. **Database migration** (SQL) - 1 day
2. **Edge functions** (TypeScript) - 3 days
3. **Client types and services** - 2 days
4. **Distributor layout and nav** - 1 day
5. **Transfer home page** - 3 days
6. **Customer management** - 4 days
7. **Accounting system** - 3 days
8. **Reports and dashboard** - 4 days
9. **Offline sync** - 2 days
10. **Tests and build validation** - 2 days

Total estimated: ~25 working days
