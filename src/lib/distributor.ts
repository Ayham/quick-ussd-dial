/**
 * Distributor Account Management
 * إدارة حساب الموزع — طلبات الرصيد والدفعات
 */

const DISTRIBUTOR_KEY = 'distributor_account_v1';

export type TransactionType = 'topup' | 'payment';

export interface DistributorTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  note: string;
  timestamp: number;
}

export interface DistributorAccount {
  name: string;
  phone: string;
  transactions: DistributorTransaction[];
  lowBalanceAlert: number; // threshold
}

const DEFAULT_ACCOUNT: DistributorAccount = {
  name: '',
  phone: '',
  transactions: [],
  lowBalanceAlert: 50000,
};

export function getDistributorAccount(): DistributorAccount {
  try {
    const stored = localStorage.getItem(DISTRIBUTOR_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { ...DEFAULT_ACCOUNT, transactions: [] };
}

export function saveDistributorAccount(account: DistributorAccount) {
  localStorage.setItem(DISTRIBUTOR_KEY, JSON.stringify(account));
}

export function addTransaction(type: TransactionType, amount: number, note: string): DistributorTransaction {
  const account = getDistributorAccount();
  const tx: DistributorTransaction = {
    id: crypto.randomUUID(),
    type,
    amount,
    note,
    timestamp: Date.now(),
  };
  account.transactions.unshift(tx);
  saveDistributorAccount(account);
  return tx;
}

export function deleteTransaction(id: string) {
  const account = getDistributorAccount();
  account.transactions = account.transactions.filter(t => t.id !== id);
  saveDistributorAccount(account);
}

export function getBalance(): number {
  const account = getDistributorAccount();
  return account.transactions.reduce((bal, tx) => {
    return tx.type === 'topup' ? bal + tx.amount : bal - tx.amount;
  }, 0);
}

export function getDistributorStats() {
  const account = getDistributorAccount();
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 86400000;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  let totalTopups = 0, totalPayments = 0;
  let monthTopups = 0, monthPayments = 0;
  let weekTopups = 0, weekPayments = 0;
  let todayTopups = 0, todayPayments = 0;

  account.transactions.forEach(tx => {
    if (tx.type === 'topup') {
      totalTopups += tx.amount;
      if (tx.timestamp >= monthStart) monthTopups += tx.amount;
      if (tx.timestamp >= weekAgo) weekTopups += tx.amount;
      if (tx.timestamp >= todayStart) todayTopups += tx.amount;
    } else {
      totalPayments += tx.amount;
      if (tx.timestamp >= monthStart) monthPayments += tx.amount;
      if (tx.timestamp >= weekAgo) weekPayments += tx.amount;
      if (tx.timestamp >= todayStart) todayPayments += tx.amount;
    }
  });

  return {
    balance: totalTopups - totalPayments,
    totalTopups, totalPayments,
    monthTopups, monthPayments,
    weekTopups, weekPayments,
    todayTopups, todayPayments,
    transactionCount: account.transactions.length,
  };
}