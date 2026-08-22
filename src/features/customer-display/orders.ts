/**
 * Persistent log of transfer requests received from the customer display.
 * Offline-first: stored in localStorage (same approach as transfer-history),
 * every request is kept independently and never replaced by newer ones.
 */
import { detectOperator } from '@/lib/ussd-profiles';

export type CustomerOrderStatus = 'pending' | 'executed' | 'cancelled';

export interface CustomerOrder {
  requestId: string;
  phone: string;
  /** Transfer quantity (SIM balance being moved). */
  amount: number;
  /** Selling price in SYP (what the customer pays). */
  price: number;
  operator: string | null;
  createdAt: number;
  receivedAt: number;
  status: CustomerOrderStatus;
  updatedAt: number;
  executedAt?: number;
  cancelledAt?: number;
  source: 'customer-display';
}

const ORDERS_KEY = 'customer-display-orders-v1';
const ORDERS_LIMIT = 1000;

/** Fired on every mutation so open pages can refresh live. */
export const CUSTOMER_ORDERS_CHANGED_EVENT = 'customer-orders-changed';

function notifyChanged() {
  try {
    window.dispatchEvent(new CustomEvent(CUSTOMER_ORDERS_CHANGED_EVENT));
  } catch {}
}

export function getCustomerOrders(): CustomerOrder[] {
  try {
    const stored = localStorage.getItem(ORDERS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function getCustomerOrder(requestId: string): CustomerOrder | null {
  return getCustomerOrders().find((o) => o.requestId === requestId) ?? null;
}

/**
 * Insert a newly received request. A requestId that already exists is ignored
 * entirely (idempotent) — a redelivered request can never reset an executed or
 * cancelled order back to pending.
 */
export function upsertCustomerOrder(
  input: Omit<CustomerOrder, 'status' | 'updatedAt' | 'source'> & { status?: CustomerOrderStatus },
): void {
  const orders = getCustomerOrders();
  if (orders.some((o) => o.requestId === input.requestId)) return;
  orders.unshift({
    ...input,
    operator: input.operator ?? detectOperator(input.phone) ?? null,
    status: input.status ?? 'pending',
    updatedAt: Date.now(),
    source: 'customer-display',
  });
  saveOrders(orders);
}

/**
 * Status transitions:
 * - pending -> executed | cancelled
 * - cancelled -> pending (undo rejection)
 * - executed is terminal except the explicit undo back to pending.
 * Returns true when the transition was applied.
 */
export function updateCustomerOrderStatus(requestId: string, status: CustomerOrderStatus): boolean {
  const orders = getCustomerOrders();
  const idx = orders.findIndex((o) => o.requestId === requestId);
  if (idx < 0 || orders[idx].status === status) return false;
  if (orders[idx].status === 'executed' && status !== 'pending') return false;

  const now = Date.now();
  const prev = orders[idx];
  orders[idx] = {
    ...prev,
    status,
    updatedAt: now,
    ...(status === 'executed' ? { executedAt: now, cancelledAt: undefined } : {}),
    ...(status === 'cancelled' ? { cancelledAt: now } : {}),
    ...(status === 'pending' ? { executedAt: undefined, cancelledAt: undefined } : {}),
  };
  saveOrders(orders);
  return true;
}

export function markCustomerOrderExecuted(requestId: string): boolean {
  if (!requestId) return false;
  return updateCustomerOrderStatus(requestId, 'executed');
}

export function markCustomerOrderCancelled(requestId: string): boolean {
  if (!requestId) return false;
  return updateCustomerOrderStatus(requestId, 'cancelled');
}

export function revertCustomerOrderToPending(requestId: string): boolean {
  if (!requestId) return false;
  return updateCustomerOrderStatus(requestId, 'pending');
}

function saveOrders(orders: CustomerOrder[]) {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, ORDERS_LIMIT)));
  } catch {}
  notifyChanged();
}
