import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Wifi, Loader2, LogOut, Send,
  CheckCircle, ScanLine, Camera, AlertTriangle, Phone as PhoneIcon, Zap, X, Delete, ChevronDown,
} from 'lucide-react';
import { App } from '@capacitor/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { CustomerDisplayClient } from '../protocol/client-plugin';
import { setupClientListeners, sendClientMessage } from '../protocol/messaging';
import { useAppMode } from '../app-mode';
import { parseConnectionPayload, getParseErrorTranslation } from '../protocol/connection-payload';
import {
  startBundledQrScan,
  openCameraSettings,
} from '@/lib/barcode-scanner';
import type { QrScanSession } from '@/lib/barcode-scanner';
import {
  CUSTOMER_DISPLAY_PROTOCOL_VERSION,
  TRANSFER_REQUEST_EXPIRY_MS,
  WS_PING_INTERVAL_MS,
  RECONNECT_DELAYS_MS,
  STORAGE_KEY_CUSTOMER_SESSION,
} from '../constants';
import type { ProtocolMessage, DisplayConfig, QrPairingData } from '../types';
import { detectOperator } from '@/lib/ussd-profiles';

type ViewState = 'scan' | 'connecting' | 'connected' | 'transfer-form' | 'sending';

const MAX_PHONE_DIGITS = 10;
const SUCCESS_DISPLAY_MS = 1800;

interface CustomerSession {
  connectionInfo: string;
  businessName?: string;
  connectedAt: number;
}

function formatPhoneDigits(p: string): string {
  if (p.length <= 4) return p;
  const head = p.slice(0, 4);
  const rest = p.slice(4);
  const parts: string[] = [];
  for (let i = 0; i < rest.length; i += 3) parts.push(rest.slice(i, i + 3));
  return [head, ...parts].join(' ');
}

export default function CustomerDisplayEntry() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language === 'ar';

  const [viewState, setViewState] = useState<ViewState>('scan');
  const [phone, setPhone] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<{ amount: number; price: number } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [sellerDeviceId, setSellerDeviceId] = useState('');
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [inputQr, setInputQr] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSession, setScanSession] = useState<QrScanSession | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [autoReconnecting, setAutoReconnecting] = useState(false);

  const { exitCustomerDisplay } = useAppMode();
  const sessionRef = useRef<{ sessionId: string; token: string } | null>(null);
  const pendingRequestRef = useRef<{ requestId: string } | null>(null);
  const listenerCleanupRef = useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConnectionRef = useRef<QrPairingData | null>(null);
  const reconnectAttemptRef = useRef(0);
  const viewStateRef = useRef<ViewState>('scan');
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successShowingRef = useRef(false);
  const presetsScrollRef = useRef<HTMLDivElement | null>(null);
  const [presetsOverflow, setPresetsOverflow] = useState(false);
  const [presetsAtEnd, setPresetsAtEnd] = useState(false);

  const updatePresetsScrollState = useCallback(() => {
    const el = presetsScrollRef.current;
    if (!el) return;
    setPresetsOverflow(el.scrollHeight > el.clientHeight + 4);
    setPresetsAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    updatePresetsScrollState();
  }, [updatePresetsScrollState]);

  // State for result display
  const [resultStatus, setResultStatus] = useState<'success' | 'failed' | null>(null);
  const [resultMessage, setResultMessage] = useState('');

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const isConnected = viewState === 'connected' || viewState === 'transfer-form' || viewState === 'sending';

  const handleExit = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    listenerCleanupRef.current?.();
    listenerCleanupRef.current = null;
    CustomerDisplayClient.disconnect().catch(() => {});
    try {
      localStorage.removeItem(STORAGE_KEY_CUSTOMER_SESSION);
    } catch {}
    exitCustomerDisplay();
    navigate('/auth', { replace: true });
  }, [exitCustomerDisplay, navigate]);

  const connectToSeller = useCallback(async (qrData: QrPairingData, opts?: { silent?: boolean }): Promise<boolean> => {
    const silent = opts?.silent ?? false;

    if (!silent) {
      setConnectionError(null);
      setAutoReconnecting(false);
    }
    setConnecting(true);
    setViewState('connecting');
    lastConnectionRef.current = qrData;

    try {
      const connectOpts = {
        host: qrData.ip,
        port: qrData.port,
        token: qrData.token,
        sessionId: qrData.sessionId,
      };

      let result;
      try {
        result = await CustomerDisplayClient.connect(connectOpts);
      } catch (err) {
        // Recover from a stale native socket that still thinks it is connected
        const msg = String((err as { message?: string })?.message ?? err ?? '');
        if (!msg.includes('Already connected')) throw err;
        await CustomerDisplayClient.disconnect().catch(() => {});
        result = await CustomerDisplayClient.connect(connectOpts);
      }

      if (!result.connected) {
        throw new Error('connection_failed');
      }

      sessionRef.current = { sessionId: qrData.sessionId, token: qrData.token };

      // Persist connection info for potential reconnection
      try {
        const session: CustomerSession = {
          connectionInfo: JSON.stringify(qrData),
          connectedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY_CUSTOMER_SESSION, JSON.stringify(session));
      } catch {}

      const pairMsg: ProtocolMessage = {
        type: 'pair',
        sessionId: qrData.sessionId,
        token: qrData.token,
        protocolVersion: CUSTOMER_DISPLAY_PROTOCOL_VERSION,
      };
      await sendClientMessage(pairMsg);

      listenerCleanupRef.current?.();
      listenerCleanupRef.current = setupClientListeners(
        (msg: ProtocolMessage) => handleServerMessage(msg),
        () => handleDisconnected()
      );

      setSellerDeviceId(qrData.sellerDeviceId || t('customerDisplay.customer.sellerDevice'));
      return true;
    } catch (err) {
      console.error('Connection failed:', err);
      if (!silent) {
        setConnectionError(t('customerDisplay.customer.connectionFailedHelp'));
        setViewState('scan');
      }
      return false;
    } finally {
      setConnecting(false);
    }
  }, [t]);

  const clearPendingTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const resetToScan = useCallback(() => {
    setViewState('scan');
    setDisplayConfig(null);
    setSellerDeviceId('');
    setBusinessName('');
    setAutoReconnecting(false);
    sessionRef.current = null;
    pendingRequestRef.current = null;
  }, []);

  // Silent retry chain with growing delays. Keeps the connection alive across
  // brief network drops, screen off, or the seller app being restarted.
  const startAutoReconnect = useCallback((initialDelayMs: number) => {
    clearPendingTimers();
    if (!lastConnectionRef.current) return;
    reconnectAttemptRef.current = 0;
    setAutoReconnecting(true);
    setViewState('connecting');

    const attemptNow = () => {
      const stored = lastConnectionRef.current;
      if (!stored || viewStateRef.current === 'scan') {
        resetToScan();
        return;
      }
      void connectToSeller(stored, { silent: true }).then((ok) => {
        if (ok) return; // pair-ack/display-config will finalize UI state
        if (viewStateRef.current === 'scan') return; // user exited meanwhile
        const attempt = ++reconnectAttemptRef.current;
        if (attempt > RECONNECT_DELAYS_MS.length) {
          toast.warning(t('customerDisplay.customer.disconnected'));
          resetToScan();
          return;
        }
        const delay = RECONNECT_DELAYS_MS[Math.min(attempt - 1, RECONNECT_DELAYS_MS.length - 1)];
        clearPendingTimers();
        reconnectTimeoutRef.current = setTimeout(attemptNow, delay);
      });
    };

    if (initialDelayMs > 0) {
      reconnectTimeoutRef.current = setTimeout(attemptNow, initialDelayMs);
    } else {
      attemptNow();
    }
  }, [clearPendingTimers, connectToSeller, resetToScan, t]);

  const hideSuccessOverlay = useCallback((resetForm: boolean) => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    successShowingRef.current = false;
    if (resetForm) {
      setPhone('');
      setSelectedAmount(null);
      setEditingPhone(false);
      pendingRequestRef.current = null;
      setResultStatus(null);
      setResultMessage('');
      setViewState('connected');
    }
  }, []);

  // Big full-screen confirmation shown briefly after the request goes out,
  // then the screen returns automatically to a fresh ready state.
  const showRequestSentSuccess = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    if (!successShowingRef.current) {
      successShowingRef.current = true;
      setPhone('');
      setSelectedAmount(null);
      setEditingPhone(false);
      pendingRequestRef.current = null;
      setResultStatus('success');
      setResultMessage(t('customerDisplay.customer.requestSentShort'));
      setViewState('connected');
    }
    successTimerRef.current = setTimeout(() => {
      successShowingRef.current = false;
      setResultStatus(null);
      setResultMessage('');
    }, SUCCESS_DISPLAY_MS);
  }, [t]);

  const handleServerMessage = useCallback((msg: ProtocolMessage) => {
    switch (msg.type) {
      case 'pair-ack': {
        // Session is confirmed; restart ping interval
        startPingInterval();
        break;
      }

      case 'display-config': {
        setDisplayConfig({
          presets: msg.presets as DisplayConfig['presets'],
          protocolVersion: msg.protocolVersion,
          businessName: msg.businessName,
        });
        if (msg.businessName) {
          setBusinessName(msg.businessName);
        }
        reconnectAttemptRef.current = 0;
        setAutoReconnecting(false);
        setViewState('connected');
        break;
      }

      case 'transfer-request-ack': {
        if (msg.status === 'pending-approval') {
          showRequestSentSuccess();
        } else if (msg.status === 'expired') {
          toast.error(t('customerDisplay.customer.requestExpired'));
          hideSuccessOverlay(true);
        } else if (msg.status === 'failed') {
          toast.error(t('customerDisplay.customer.sendFailed'));
          hideSuccessOverlay(true);
        }
        break;
      }

      case 'transfer-result': {
        if (msg.status === 'success') {
          toast.success(msg.message || t('customerDisplay.customer.transferSuccess'), { duration: 5000 });
        } else {
          toast.error(msg.message || t('customerDisplay.customer.transferFailed'), { duration: 5000 });
        }
        break;
      }

      case 'ping': {
        sendClientMessage({ type: 'pong' }).catch(() => {});
        break;
      }

      case 'disconnect': {
        handleDisconnected();
        break;
      }
    }
  }, [t, showRequestSentSuccess, hideSuccessOverlay]);

  // Ping interval to keep connection alive (single chain, no duplicates)
  const startPingInterval = useCallback(() => {
    clearPendingTimers();
    const ping = async () => {
      try {
        const connected = await CustomerDisplayClient.isConnected();
        if (!connected.connected) {
          handleDisconnected();
          return;
        }
        await sendClientMessage({ type: 'ping' });
      } catch {}
      reconnectTimeoutRef.current = setTimeout(ping, WS_PING_INTERVAL_MS);
    };
    ping();
  }, [clearPendingTimers]);

  const handleDisconnected = useCallback(() => {
    clearPendingTimers();
    sessionRef.current = null;
    pendingRequestRef.current = null;

    // Make sure we have credentials to retry with
    if (!lastConnectionRef.current) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_CUSTOMER_SESSION);
        if (stored) {
          const s: CustomerSession = JSON.parse(stored);
          if (s.connectionInfo) {
            lastConnectionRef.current = JSON.parse(s.connectionInfo) as QrPairingData;
          }
        }
      } catch {}
    }

    // Never give up silently: auto-reconnect in the background while showing
    // a connecting state. Only drop back to the scan screen if there is
    // nothing to reconnect with.
    startAutoReconnect(2000);
  }, [clearPendingTimers, startAutoReconnect]);

  const processPayload = useCallback((raw: string) => {
    const result = parseConnectionPayload(raw);
    if (!result.ok) {
      const key = getParseErrorTranslation(result.error);
      toast.error(t(key));
      return;
    }
    connectToSeller(result.data);
  }, [connectToSeller, t]);

  const handleScanQr = useCallback(async () => {
    setConnectionError(null);
    setScanning(true);
    try {
      const session = await startBundledQrScan();
      setScanSession(session);
      const result = await session.done;
      switch (result.status) {
        case 'ok':
          processPayload(result.value);
          break;
        case 'denied':
          toast.error(t('customerDisplay.customer.cameraDenied'), {
            duration: 10000,
            action: {
              label: t('customerDisplay.customer.openSettings'),
              onClick: () => { openCameraSettings(); },
            },
          });
          break;
        case 'cancelled':
          toast.info(t('customerDisplay.customer.scanCancelled'));
          break;
        case 'error':
          console.warn('Scan failed:', result.message);
          toast.error(
            result.message
              ? `${t('customerDisplay.customer.scanError')} (${result.message})`
              : t('customerDisplay.customer.scanError')
          );
          break;
      }
    } finally {
      setScanSession(null);
      setScanning(false);
    }
  }, [processPayload, t]);

  const handleManualConnect = useCallback(() => {
    if (!inputQr.trim()) {
      toast.error(t('customerDisplay.customer.invalidQr'));
      return;
    }
    processPayload(inputQr.trim());
  }, [inputQr, processPayload, t]);

  const sendTransferRequest = useCallback(async () => {
    if (!phone.trim() || !selectedAmount) return;

    setViewState('sending');

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const msg: ProtocolMessage = {
      type: 'transfer-request',
      requestId,
      phone: phone.trim(),
      amount: selectedAmount.amount,
      price: selectedAmount.price,
      nonce: Math.random().toString(36).slice(2),
      timestamp: now,
      expiresAt: now + TRANSFER_REQUEST_EXPIRY_MS,
    };

    try {
      await sendClientMessage(msg);
      pendingRequestRef.current = { requestId };
      showRequestSentSuccess();
    } catch {
      toast.error(t('customerDisplay.customer.sendFailed'));
      setViewState('connected');
    }
  }, [phone, selectedAmount, t, showRequestSentSuccess]);

  // Auto-reconnect on mount if we have a stored session (no expiry - the
  // pairing stays valid until the seller regenerates the QR)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_CUSTOMER_SESSION);
    if (stored) {
      try {
        const session: CustomerSession = JSON.parse(stored);
        if (session.connectionInfo) {
          const qrData = JSON.parse(session.connectionInfo) as QrPairingData;
          lastConnectionRef.current = qrData;
          setBusinessName(session.businessName || '');
          startAutoReconnect(0);
        }
      } catch {}
    }

    // Reconnect immediately when the app returns to the foreground
    let resumeHandle: { remove: () => Promise<void> } | null = null;
    App.addListener('resume', () => {
      if (!lastConnectionRef.current) return;
      if (viewStateRef.current === 'scan') return;
      void CustomerDisplayClient.isConnected().then((st) => {
        if (st.connected) {
          startPingInterval();
          return;
        }
        startAutoReconnect(0);
      }).catch(() => {});
    }).then((h) => { resumeHandle = h; }).catch(() => {});

    return () => {
      void resumeHandle?.remove().catch(() => {});
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore businessName from displayConfig
  useEffect(() => {
    if (displayConfig?.businessName) {
      setBusinessName(displayConfig.businessName);
    }
  }, [displayConfig?.businessName]);

  // Android back button closes the live scanner instead of leaving the page
  useEffect(() => {
    if (!scanSession) return;
    let handle: { remove: () => Promise<void> } | null = null;
    App.addListener('backButton', () => { scanSession.cancel(); })
      .then((h) => { handle = h; })
      .catch(() => {});
    return () => { void handle?.remove().catch(() => {}); };
  }, [scanSession]);

  // The camera preview is rendered BEHIND the WebView by the native plugin.
  // Page backgrounds must become transparent while scanning or the camera
  // stays completely hidden behind opaque UI.
  useEffect(() => {
    const el = document.documentElement;
    if (scanSession) {
      el.classList.add('cd-scanning');
    } else {
      el.classList.remove('cd-scanning');
    }
    return () => el.classList.remove('cd-scanning');
  }, [scanSession]);

  const operator = detectOperator(phone);
  const currentPresets = operator === 'syriatel'
    ? (displayConfig?.presets?.syriatel || [])
    : operator === 'mtn'
    ? (displayConfig?.presets?.mtn || [])
    : [...(displayConfig?.presets?.syriatel || []), ...(displayConfig?.presets?.mtn || [])];

  const phoneReady = phone.trim().length >= MAX_PHONE_DIGITS;
  const amountsMode = phoneReady && !editingPhone && currentPresets.length > 0;

  const pressDigit = useCallback((d: string) => {
    setPhone(prev => {
      if (prev.length >= MAX_PHONE_DIGITS) return prev;
      return prev + d;
    });
    setSelectedAmount(null);
    setEditingPhone(false);
  }, []);

  const pressDelete = useCallback(() => {
    setPhone(prev => prev.slice(0, -1));
    setSelectedAmount(null);
  }, []);

  const pressClearAll = useCallback(() => {
    setPhone('');
    setSelectedAmount(null);
    setEditingPhone(false);
  }, []);

  const renderKeypadButton = (label: string, onPress: () => void, extra?: ReactNode, disabled?: boolean) => (
    <button
      onClick={onPress}
      disabled={disabled}
      className="h-14 sm:h-16 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center text-[28px] sm:text-3xl font-bold text-foreground tabular-nums select-none touch-manipulation press-effect transition-colors active:bg-accent hover:bg-accent/40 focus-ring disabled:opacity-40"
    >
      {extra ?? label}
    </button>
  );

  return (
    <div className={`min-h-dvh flex flex-col ${scanSession ? 'bg-transparent' : 'bg-background'}`} dir={isArabic ? 'rtl' : 'ltr'}>
      {scanSession && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-between p-6"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          {/* Dimming mask with a transparent cutout - the camera shows
              through the window while everything else stays dimmed */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 rounded-3xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)]" />
          </div>

          <p className="relative text-base font-medium text-white/95 text-center pt-2 drop-shadow-md">
            {t('customerDisplay.customer.scannerHint')}
          </p>

          <div className="relative w-64 h-64 pointer-events-none">
            <div className="absolute -top-1.5 -start-1.5 w-10 h-10 border-t-4 border-s-4 border-primary rounded-tl-3xl" />
            <div className="absolute -top-1.5 -end-1.5 w-10 h-10 border-t-4 border-e-4 border-primary rounded-tr-3xl" />
            <div className="absolute -bottom-1.5 -start-1.5 w-10 h-10 border-b-4 border-s-4 border-primary rounded-bl-3xl" />
            <div className="absolute -bottom-1.5 -end-1.5 w-10 h-10 border-b-4 border-e-4 border-primary rounded-br-3xl" />
          </div>

          <div className="relative flex items-center gap-3">
            <Button
              onClick={() => { void scanSession.toggleTorch(); }}
              variant="outline"
              size="icon"
              className="w-12 h-12 rounded-full bg-white/15 border-white/30 text-white hover:bg-white/25"
              aria-label={t('customerDisplay.customer.torch')}
            >
              <Zap className="w-5 h-5" />
            </Button>
            <Button
              onClick={() => scanSession.cancel()}
              variant="outline"
              className="h-12 px-8 rounded-full bg-white/15 border-white/30 text-white hover:bg-white/25 font-bold"
            >
              <X className="w-5 h-5 me-2" />
              {t('customerDisplay.customer.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Full-screen "request sent" confirmation — auto-dismisses and resets */}
      {resultStatus === 'success' && (
        <div className="fixed inset-0 z-[95] bg-success/95 dark:bg-success/90 flex flex-col items-center justify-center gap-7 px-6 animate-fade-in">
          <div className="w-28 h-28 rounded-full bg-white shadow-xl flex items-center justify-center animate-bounce-in">
            <CheckCircle className="w-16 h-16 text-success" strokeWidth={2.5} />
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold text-white text-center leading-snug">
            {resultMessage || t('customerDisplay.customer.requestSentShort')}
          </p>
        </div>
      )}

      {/* Minimal top strip — shop name and quiet exit, nothing technical */}
      <header className="shrink-0 px-4 pt-[calc(var(--sat)+10px)] pb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
          <span className="text-sm font-bold text-muted-foreground truncate max-w-[240px]">
            {businessName || t('customerDisplay.customer.title')}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleExit}
          className="w-9 h-9 rounded-full text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 shrink-0"
          aria-label={t('customerDisplay.customer.exit')}
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto overflow-y-auto pb-safe scrollbar-none">
        <div className="min-h-full flex flex-col px-4 pt-2">

          {viewState === 'scan' && !scanSession && (
            <Card className="border border-border/60 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-card">
              <CardContent className="p-6 space-y-5">
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-primary/10 flex items-center justify-center shadow-inner">
                    <ScanLine className="w-10 h-10 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold">{t('customerDisplay.customer.scanTitle')}</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                    {t('customerDisplay.customer.scanDescription')}
                  </p>
                </div>

                {connectionError && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive leading-relaxed">{connectionError}</p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleScanQr}
                  disabled={scanning}
                  className="w-full h-16 rounded-2xl font-bold text-lg shadow-md"
                >
                  {scanning ? (
                    <Loader2 className="w-6 h-6 animate-spin me-2" />
                  ) : (
                    <Camera className="w-6 h-6 me-2" />
                  )}
                  {t('customerDisplay.customer.scanQrCode')}
                </Button>

                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-card px-3 text-muted-foreground font-medium">{t('customerDisplay.customer.or')}</span>
                  </div>
                </div>

                <Button
                  onClick={() => setShowManualInput(!showManualInput)}
                  variant="outline"
                  className="w-full h-13 rounded-xl font-medium border-border/80"
                >
                  {showManualInput ? t('common.cancel') : t('customerDisplay.customer.manualEntry')}
                </Button>

                {showManualInput && (
                  <div className="space-y-3 pt-2 animate-slide-up">
                    <Input
                      value={inputQr}
                      onChange={(e) => setInputQr(e.target.value)}
                      placeholder={t('customerDisplay.customer.qrPlaceholder')}
                      className="h-12 rounded-xl font-mono text-xs bg-background/50 border-border/80"
                      dir="ltr"
                    />
                    <Button
                      onClick={handleManualConnect}
                      disabled={connecting || !inputQr.trim()}
                      className="w-full h-13 rounded-xl font-bold"
                    >
                      {connecting ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Wifi className="w-4 h-4 me-2" />}
                      {t('customerDisplay.customer.connect')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {viewState === 'connecting' && (
            <Card className="border border-border/60 shadow-sm rounded-2xl bg-white dark:bg-card">
              <CardContent className="p-8 flex flex-col items-center justify-center gap-4 text-center">
                <Loader2 className="w-14 h-14 text-primary animate-spin" />
                <div className="space-y-1">
                  <h3 className="font-bold text-base">{t('customerDisplay.customer.connectingTitle')}</h3>
                  <p className="text-xs text-muted-foreground">
                    {autoReconnecting
                      ? t('customerDisplay.customer.reconnecting')
                      : t('customerDisplay.customer.connecting')}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {(viewState === 'connected' || viewState === 'transfer-form') && !amountsMode && (
            <div className="flex-1 flex flex-col">
              {/* Big phone display */}
              <div className="relative bg-card border border-border rounded-2xl shadow-sm px-4 pt-4 pb-4 mb-4">
                <p className="text-sm font-semibold text-muted-foreground text-center mb-2">
                  {t('customerDisplay.customer.enterPhone')}
                </p>
                <div dir="ltr" className="min-h-[56px] flex items-center justify-center gap-1.5 overflow-hidden">
                  {phone ? (
                    <>
                      <span className="text-[34px] sm:text-4xl leading-none font-extrabold tracking-wide tabular-nums whitespace-nowrap">
                        {formatPhoneDigits(phone)}
                      </span>
                      <span className="w-[3px] h-9 rounded-full bg-primary animate-pulse shrink-0" aria-hidden />
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-muted-foreground/50 tracking-wide">
                      {t('customerDisplay.customer.phonePlaceholder')}
                    </span>
                  )}
                </div>

                {operator && (
                  <div className="flex justify-center mt-3 animate-fade-in">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${
                      operator === 'mtn' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    }`}>
                      <PhoneIcon className="w-3.5 h-3.5" />
                      {operator === 'mtn' ? 'MTN' : t('operator.syriatel')}
                    </span>
                  </div>
                )}

                {phone.length > 0 && (
                  <button
                    onClick={pressClearAll}
                    className="absolute top-3 end-3 w-8 h-8 rounded-full bg-muted/70 text-muted-foreground flex items-center justify-center active:bg-muted press-effect"
                    aria-label={t('customerDisplay.customer.clearAll')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* On-screen keypad — force LTR layout like every real dialer */}
              <div dir="ltr" className="mt-auto grid grid-cols-3 gap-2.5 pb-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    onClick={() => pressDigit(d)}
                    className="h-14 sm:h-16 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center text-[28px] sm:text-3xl font-bold text-foreground tabular-nums select-none touch-manipulation press-effect transition-colors active:bg-accent hover:bg-accent/40 focus-ring"
                  >
                    {d}
                  </button>
                ))}
                <span aria-hidden />
                {renderKeypadButton('0', () => pressDigit('0'))}
                {renderKeypadButton('', pressDelete, <Delete className="w-7 h-7" />, phone.length === 0)}
              </div>
            </div>
          )}

          {(viewState === 'connected' || viewState === 'transfer-form') && amountsMode && (
            <div className="flex-1 flex flex-col">
              {/* Compact phone summary — tap to edit */}
              <button
                onClick={() => setEditingPhone(true)}
                className="shrink-0 w-full bg-card border border-border rounded-2xl shadow-sm px-4 py-3 mb-3 flex items-center justify-between gap-2 press-effect active:bg-accent/40 text-start"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <PhoneIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                  <span dir="ltr" className="text-xl font-extrabold tracking-wide tabular-nums truncate">
                    {formatPhoneDigits(phone.trim())}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {operator && (
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      operator === 'mtn' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    }`}>
                      {operator === 'mtn' ? 'MTN' : t('operator.syriatel')}
                    </span>
                  )}
                  <span className="text-xs font-bold text-primary underline underline-offset-4 decoration-primary/40">
                    {t('customerDisplay.customer.editNumber')}
                  </span>
                </span>
              </button>

              <p className="shrink-0 text-sm font-semibold text-muted-foreground text-center mb-2.5">
                {t('customerDisplay.customer.chooseAmount')}
              </p>

              {/* Amount presets — exactly 3 rows visible with scroll affordance */}
              <div className="relative shrink-0">
                <div
                  ref={presetsScrollRef}
                  onScroll={updatePresetsScrollState}
                  className="max-h-[19.25rem] overflow-y-auto scrollbar-none"
                >
                  <div className="grid grid-cols-2 gap-2.5 pb-2">
                    {currentPresets.map((preset, i) => {
                      const isSelected = selectedAmount?.amount === preset.amount;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedAmount(preset)}
                          className={`relative flex flex-col items-center justify-center h-24 px-2 rounded-2xl border-2 transition-all select-none touch-manipulation press-effect ${
                            isSelected
                              ? 'border-primary bg-primary text-white shadow-lg shadow-primary/30 scale-[1.02]'
                              : 'border-border bg-card hover:border-primary/50 hover:shadow-sm'
                          }`}
                        >
                          <span className="text-2xl font-extrabold tabular-nums tracking-tight whitespace-nowrap">
                            {preset.price.toLocaleString()}{' '}
                            <span className="text-base font-bold">{t('common.currencySymbol')}</span>
                          </span>
                          <span className={`mt-1.5 text-xs font-normal ${isSelected ? 'text-white/85' : 'text-muted-foreground'}`}>
                            {t('customerDisplay.customer.transferValueShort', { amount: preset.amount.toLocaleString() })}
                          </span>
                          {isSelected && (
                            <span className="absolute -top-2 -end-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md border border-primary/20">
                              <CheckCircle className="w-4 h-4 text-primary" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {presetsOverflow && !presetsAtEnd && (
                  <>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background via-background/80 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
                      <ChevronDown className="w-6 h-6 text-primary animate-bounce drop-shadow" />
                    </div>
                  </>
                )}
              </div>

              {/* Transfer button appears once an amount is picked */}
              {selectedAmount && (
                <Button
                  onClick={sendTransferRequest}
                  className="shrink-0 sticky bottom-0 w-full h-16 text-2xl font-extrabold rounded-2xl shadow-lg shadow-primary/30 my-2 animate-slide-up"
                >
                  <Send className="w-6 h-6 me-2.5 rtl:-scale-x-100" />
                  {t('customerDisplay.customer.transferNow')}
                </Button>
              )}
            </div>
          )}

          {viewState === 'sending' && (
            <Card className="border border-border/60 shadow-sm rounded-2xl bg-white dark:bg-card my-auto">
              <CardContent className="p-8 flex flex-col items-center justify-center gap-5 text-center">
                <Loader2 className="w-14 h-14 text-primary animate-spin" />
                <div className="space-y-1.5">
                  <h3 className="font-bold text-lg">{t('customerDisplay.customer.sendingRequest')}</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    pendingRequestRef.current = null;
                    setViewState('connected');
                  }}
                  className="h-10 px-6 rounded-xl text-muted-foreground mt-1"
                >
                  {t('customerDisplay.customer.cancel')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
