import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  MonitorSmartphone, Wifi, Loader2, LogOut, Send,
  CheckCircle, XCircle, ScanLine, Camera, Settings, AlertTriangle, Phone as PhoneIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { CustomerDisplayClient } from '../protocol/client-plugin';
import { setupClientListeners, sendClientMessage } from '../protocol/messaging';
import { useAppMode } from '../app-mode';
import { isExpired } from '../protocol/crypto';
import { parseConnectionPayload, getParseErrorTranslation } from '../protocol/connection-payload';
import {
  scanQrCode,
  checkCameraPermission,
  openCameraSettings,
} from '@/lib/barcode-scanner';
import {
  CUSTOMER_DISPLAY_PROTOCOL_VERSION,
  TRANSFER_REQUEST_EXPIRY_MS,
  QR_CODE_EXPIRY_MS,
  STORAGE_KEY_CUSTOMER_SESSION,
} from '../constants';
import type { ProtocolMessage, DisplayConfig, QrPairingData } from '../types';
import { detectOperator } from '@/lib/ussd-profiles';

type ViewState = 'scan' | 'connecting' | 'connected' | 'transfer-form' | 'sending';

interface CustomerSession {
  connectionInfo: string;
  businessName?: string;
  connectedAt: number;
}

export default function CustomerDisplayEntry() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language === 'ar';

  const [viewState, setViewState] = useState<ViewState>('scan');
  const [phone, setPhone] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<{ amount: number; price: number } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [sellerDeviceId, setSellerDeviceId] = useState('');
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [inputQr, setInputQr] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const { exitCustomerDisplay } = useAppMode();
  const sessionRef = useRef<{ sessionId: string; token: string } | null>(null);
  const pendingRequestRef = useRef<{ requestId: string } | null>(null);
  const listenerCleanupRef = useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConnectionRef = useRef<QrPairingData | null>(null);

  const isConnected = viewState === 'connected' || viewState === 'transfer-form' || viewState === 'sending';

  const handleExit = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
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

  const connectToSeller = useCallback(async (qrData: QrPairingData) => {
    if (isExpired(qrData.expiresAt)) {
      toast.error(t('customerDisplay.customer.qrExpired'));
      return;
    }

    setConnectionError(null);
    setConnecting(true);
    setViewState('connecting');
    lastConnectionRef.current = qrData;

    try {
      const result = await CustomerDisplayClient.connect({
        host: qrData.ip,
        port: qrData.port,
        token: qrData.token,
        sessionId: qrData.sessionId,
      });

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
    } catch (err) {
      console.error('Connection failed:', err);
      setConnectionError(t('customerDisplay.customer.connectionFailedHelp'));
      setViewState('scan');
    } finally {
      setConnecting(false);
    }
  }, [t]);

  const reconnect = useCallback(async () => {
    const stored = lastConnectionRef.current;
    if (!stored) return;
    await connectToSeller(stored);
  }, [connectToSeller]);

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
        setViewState('connected');
        break;
      }

      case 'transfer-request-ack': {
        if (msg.status === 'pending-approval') {
          toast.success(t('customerDisplay.customer.requestSent'));
          // Reset immediately to a clean state, ready for next customer
          setPhone('');
          setSelectedAmount(null);
          setResultStatus('success');
          setResultMessage(t('customerDisplay.customer.requestReceived'));
          pendingRequestRef.current = null;
          // Go back to connected view for a fresh transfer
          setTimeout(() => {
            setResultMessage('');
            setViewState('connected');
          }, 1500);
        } else if (msg.status === 'expired') {
          toast.error(t('customerDisplay.customer.requestExpired'));
          resetCustomerForm();
        } else if (msg.status === 'failed') {
          toast.error(t('customerDisplay.customer.sendFailed'));
          resetCustomerForm();
        }
        break;
      }

      case 'transfer-result': {
        if (msg.status === 'success') {
          toast.success(msg.message || t('customerDisplay.customer.transferSuccess'), { duration: 5000 });
        } else {
          toast.error(msg.message || t('customerDisplay.customer.transferFailed'), { duration: 5000 });
        }
        resetCustomerForm();
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
  }, [t]);

  const resetCustomerForm = useCallback(() => {
    setPhone('');
    setSelectedAmount(null);
    setResultStatus(null);
    setResultMessage('');
    pendingRequestRef.current = null;
    setViewState('connected');
  }, []);

  // Ping interval to keep connection alive
  const startPingInterval = useCallback(() => {
    const ping = async () => {
      try {
        const connected = await CustomerDisplayClient.isConnected();
        if (!connected.connected) {
          handleDisconnected();
          return;
        }
        await sendClientMessage({ type: 'ping' });
      } catch {}
      reconnectTimeoutRef.current = setTimeout(ping, 15000);
    };
    ping();
  }, []);

  const handleDisconnected = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setViewState('scan');
    setDisplayConfig(null);
    setSellerDeviceId('');
    setBusinessName('');
    toast.warning(t('customerDisplay.customer.disconnected'));

    // Attempt to reconnect to last known connection
    if (lastConnectionRef.current) {
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnect().catch(() => {});
      }, 2000);
    } else {
      try {
        localStorage.getItem(STORAGE_KEY_CUSTOMER_SESSION);
      } catch {}
    }
  }, [t, reconnect]);

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
      const code = await scanQrCode();
      if (code) {
        processPayload(code);
      } else {
        toast.info(t('customerDisplay.customer.scanCancelled'));
      }
    } catch (err) {
      console.error('Scan error:', err);
      toast.error(t('customerDisplay.customer.scanError'));
    } finally {
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
      toast.success(t('customerDisplay.customer.requestSent'));
      // Immediately reset to clean connected state, ready for next transfer
      setTimeout(() => {
        setPhone('');
        setSelectedAmount(null);
        setViewState('connected');
      }, 1000);
    } catch {
      toast.error(t('customerDisplay.customer.sendFailed'));
      setViewState('connected');
    }
  }, [phone, selectedAmount, t]);

  const handleNewTransfer = useCallback(() => {
    setPhone('');
    setSelectedAmount(null);
    pendingRequestRef.current = null;
    setViewState('connected');
  }, []);

  // Auto-reconnect on mount if we have a stored session
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_CUSTOMER_SESSION);
    if (stored) {
      try {
        const session: CustomerSession = JSON.parse(stored);
        if (session.connectionInfo) {
          const qrData = JSON.parse(session.connectionInfo) as QrPairingData;
          lastConnectionRef.current = qrData;
          setBusinessName(session.businessName || '');
          // Only auto-reconnect if the QR/payload isn't expired
          if (!isExpired(qrData.expiresAt)) {
            reconnect();
          }
        }
      } catch {}
    }
  }, []);

  // Restore businessName from displayConfig
  useEffect(() => {
    if (displayConfig?.businessName) {
      setBusinessName(displayConfig.businessName);
    }
  }, [displayConfig?.businessName]);

  const operator = detectOperator(phone);
  const currentPresets = operator === 'syriatel'
    ? (displayConfig?.presets?.syriatel || [])
    : operator === 'mtn'
    ? (displayConfig?.presets?.mtn || [])
    : [...(displayConfig?.presets?.syriatel || []), ...(displayConfig?.presets?.mtn || [])];

  // State for result display
  const [resultStatus, setResultStatus] = useState<'success' | 'failed' | null>(null);
  const [resultMessage, setResultMessage] = useState('');

  return (
    <div className="min-h-dvh bg-background flex flex-col" dir={isArabic ? 'rtl' : 'ltr'}>
      {/* Top Header - similar to main app */}
      <header className="header-gradient px-4 pb-3 pt-[calc(var(--sat)+10px)] flex items-center justify-between z-header sticky top-0 shadow-[0_2px_12px_-4px_hsl(var(--primary)/0.35)]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
            <MonitorSmartphone className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-white text-base font-bold truncate max-w-[180px]">
              {businessName || t('customerDisplay.customer.title')}
            </h1>
            <div className="flex items-center gap-1.5">
              {isConnected ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-200 font-medium">متصل</span>
                </>
              ) : (
                <span className="text-xs text-red-200 font-medium">{t('customerDisplay.customer.scanPrompt')}</span>
              )}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleExit} className="text-white hover:bg-white/20 hover:text-destructive h-8 px-2">
          <LogOut className="w-3.5 h-3.5" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto pb-safe">
        <div className="max-w-md w-full mx-auto p-4 space-y-4">
          {viewState === 'scan' && (
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
                  className="w-full h-14 rounded-xl font-bold text-base shadow-md"
                >
                  {scanning ? (
                    <Loader2 className="w-5 h-5 animate-spin me-2" />
                  ) : (
                    <Camera className="w-5 h-5 me-2" />
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
                  className="w-full h-12 rounded-xl font-medium border-border/80"
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
                      className="w-full h-12 rounded-xl font-bold"
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
                  <p className="text-xs text-muted-foreground">{t('customerDisplay.customer.connecting')}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {(viewState === 'connected' || viewState === 'transfer-form') && (
            <div className="space-y-4">
              {/* Phone input at top, following main transfer interface */}
              <Card className="border border-border/60 shadow-sm rounded-2xl bg-white dark:bg-card">
                <CardContent className="p-5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      {t('customerDisplay.customer.phoneLabel')}
                    </label>
                    <div className="relative">
                      <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <PhoneIcon className="w-5 h-5" />
                      </span>
                      <Input
                        type="tel"
                        placeholder={t('customerDisplay.customer.phonePlaceholder')}
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          setSelectedAmount(null);
                        }}
                        className="h-14 text-lg font-mono ps-11 pe-4 rounded-xl border-2 bg-background/50"
                        dir="ltr"
                        inputMode="tel"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Operator badge shown below phone input */}
              {operator && (
                <div className="flex justify-start px-1 animate-fade-in">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm ${
                    operator === 'mtn' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    <PhoneIcon className="w-3.5 h-3.5" />
                    {operator === 'mtn' ? 'MTN' : t('operator.syriatel')}
                  </span>
                </div>
              )}

              {phone.trim().length >= 10 && currentPresets.length > 0 && (
                <Card className="border border-border/60 shadow-sm rounded-2xl bg-white dark:bg-card animate-slide-up">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">{t('customerDisplay.customer.chooseAmount')}</span>
                      {selectedAmount && (
                        <span className="text-xs font-bold text-primary">
                          {selectedAmount.price.toLocaleString()} {t('common.currencySymbol')}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto p-1">
                      {currentPresets.map((preset, i) => {
                        const isSelected = selectedAmount?.amount === preset.amount;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedAmount(preset)}
                            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-primary bg-primary text-white shadow-md scale-[1.02]'
                                : 'border-border/80 bg-background hover:border-primary/40 hover:shadow-sm'
                            }`}
                          >
                            <span className="font-bold text-sm tracking-tight">{preset.price.toLocaleString()}</span>
                            <span className={`text-[11px] mt-1 font-medium ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>
                              {preset.amount.toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button
                onClick={sendTransferRequest}
                disabled={!phone.trim() || phone.trim().length < 10 || !selectedAmount}
                className="w-full h-14 text-base font-bold rounded-2xl shadow-lg"
              >
                <Send className="w-5 h-5 me-2" />
                {t('customerDisplay.customer.sendRequest')}
              </Button>
            </div>
          )}

          {viewState === 'sending' && (
            <Card className="border border-border/60 shadow-sm rounded-2xl bg-white dark:bg-card">
              <CardContent className="p-8 flex flex-col items-center justify-center gap-5 text-center">
                <Loader2 className="w-14 h-14 text-primary animate-spin" />
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base">{t('customerDisplay.customer.waitingTitle')}</h3>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    {t('customerDisplay.customer.processing')}
                  </p>
                </div>
                {pendingRequestRef.current && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      pendingRequestRef.current = null;
                      handleNewTransfer();
                    }}
                    className="h-11 px-6 rounded-xl mt-2"
                  >
                    {t('customerDisplay.customer.cancel')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
