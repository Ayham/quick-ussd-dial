import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { STORAGE_KEY_APP_MODE, STORAGE_KEY_CUSTOMER_SESSION } from './constants';
import type { AppMode } from './types';

interface AppModeState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  isCustomerDisplay: boolean;
  isSeller: boolean;
  exitCustomerDisplay: () => void;
}

const AppModeContext = createContext<AppModeState | null>(null);

function getStoredMode(): AppMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_APP_MODE);
    if (stored === 'customer-display' || stored === 'seller') return stored;
  } catch {}
  return 'seller';
}

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(getStoredMode);

  const setMode = useCallback((newMode: AppMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY_APP_MODE, newMode);
    } catch {}
  }, []);

  const exitCustomerDisplay = useCallback(() => {
    setModeState('seller');
    try {
      localStorage.removeItem(STORAGE_KEY_APP_MODE);
      localStorage.removeItem(STORAGE_KEY_CUSTOMER_SESSION);
    } catch {}
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_APP_MODE && e.newValue) {
        if (e.newValue === 'customer-display' || e.newValue === 'seller') {
          setModeState(e.newValue);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value: AppModeState = {
    mode,
    setMode,
    isCustomerDisplay: mode === 'customer-display',
    isSeller: mode === 'seller',
    exitCustomerDisplay,
  };

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeState {
  const ctx = useContext(AppModeContext);
  if (!ctx) throw new Error('useAppMode must be used inside AppModeProvider');
  return ctx;
}
