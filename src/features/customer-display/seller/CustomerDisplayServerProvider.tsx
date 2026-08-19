import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CustomerDisplayServer } from '../protocol/server-plugin';
import { setupServerListeners, sendServerMessage } from '../protocol/messaging';
import { generateSessionId, generatePairingToken, isExpired } from '../protocol/crypto';
import { setCustomerTransferPending } from '../transfer-callback';
import {
  WS_SERVER_PORT,
  CUSTOMER_DISPLAY_PROTOCOL_VERSION,
  QR_CODE_EXPIRY_MS,
} from '../constants';
import type { ProtocolMessage, DisplayConfig, TransferRequestStatus } from '../types';
import { getPresets } from '@/lib/ussd-profiles';
import { getBusinessName } from '@/lib/onboarding';

export interface PendingCustomerRequest {
  requestId: string;
  phone: string;
  amount: number;
  price: number;
  status: TransferRequestStatus;
}

interface CustomerDisplayServerState {
  serverRunning: boolean;
  serverIp: string;
  serverPort: number;
  sessionId: string;
  pairingToken: string;
  customerConnected: boolean;
  customerDisplayId: string | null;
  loading: boolean;
  pendingRequest: PendingCustomerRequest | null;
  qrData: string;
}

interface CustomerDisplayServerActions {
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  regenerateQr: () => void;
  approveRequest: () => PendingCustomerRequest | null;
  rejectRequest: () => Promise<void>;
}

type CustomerDisplayServerContext = CustomerDisplayServerState & CustomerDisplayServerActions;

const Ctx = createContext<CustomerDisplayServerContext | null>(null);

export function useCustomerDisplayServer(): CustomerDisplayServerContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCustomerDisplayServer must be used within CustomerDisplayServerProvider');
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
}

export function CustomerDisplayServerProvider({ children }: ProviderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [serverRunning, setServerRunning] = useState(false);
  const [serverIp, setServerIp] = useState('');
  const [serverPort, setServerPort] = useState(0);
  const [sessionId, setSessionId] = useState('');
  const [pairingToken, setPairingToken] = useState('');
  const [customerConnected, setCustomerConnected] = useState(false);
  const [customerDisplayId, setCustomerDisplayId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<PendingCustomerRequest | null>(null);

  const pendingRequestRef = useRef<PendingCustomerRequest | null>(null);
  const qrExpiresAtRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef('');
  const sessionIdRef = useRef('');

  const handleClientMessage = useCallback(async (msg: ProtocolMessage) => {
    switch (msg.type) {
      case 'pair': {
        if (isExpired(qrExpiresAtRef.current)) {
          await sendServerMessage({ type: 'pair-reject', reason: 'QR expired' });
          return;
        }
        const tokenValid = msg.token === tokenRef.current && msg.sessionId === sessionIdRef.current;
        if (!tokenValid) {
          await sendServerMessage({ type: 'pair-reject', reason: 'Invalid token' });
          return;
        }
        const displayId = `cd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setCustomerDisplayId(displayId);
        await sendServerMessage({
          type: 'pair-ack',
          sessionId: sessionIdRef.current,
          customerDisplayId: displayId,
        });

        const presets = getPresets();
        const businessName = getBusinessName();
        const displayConfig: DisplayConfig = {
          presets: presets as unknown as Record<string, Array<{ amount: number; price: number }>>,
          protocolVersion: CUSTOMER_DISPLAY_PROTOCOL_VERSION,
          businessName,
        };
        await sendServerMessage({
          type: 'display-config',
          presets: displayConfig.presets,
          protocolVersion: CUSTOMER_DISPLAY_PROTOCOL_VERSION,
          businessName: displayConfig.businessName,
        });
        break;
      }

      case 'transfer-request': {
        if (isExpired(msg.expiresAt)) {
          await sendServerMessage({
            type: 'transfer-request-ack',
            requestId: msg.requestId,
            status: 'expired',
          });
          return;
        }

        const phoneValid = /^[0-9]{10}$/.test(msg.phone);
        if (!phoneValid) {
          await sendServerMessage({
            type: 'transfer-request-ack',
            requestId: msg.requestId,
            status: 'failed',
          });
          return;
        }

        const req: PendingCustomerRequest = {
          requestId: msg.requestId,
          phone: msg.phone,
          amount: msg.amount,
          price: msg.price,
          status: 'pending-approval',
        };
        setPendingRequest(req);
        pendingRequestRef.current = req;
        setCustomerTransferPending(msg.requestId);

        await sendServerMessage({
          type: 'transfer-request-ack',
          requestId: msg.requestId,
          status: 'pending-approval',
        });

        toast.success(t('customerDisplay.seller.requestTransferredToScreen', { phone: msg.phone }));

        try {
          navigate('/', {
            state: {
              customerTransferRequest: {
                requestId: msg.requestId,
                phone: msg.phone,
                amount: msg.amount,
                price: msg.price,
              },
            },
            replace: true,
          });
        } catch (e) {
          console.warn('Navigation to main screen failed:', e);
        }
        break;
      }

      case 'ping': {
        await sendServerMessage({ type: 'pong' });
        break;
      }
    }
  }, []);

  const startServer = useCallback(async () => {
    setLoading(true);
    try {
      const id = generateSessionId();
      const token = generatePairingToken();
      const now = Date.now();
      qrExpiresAtRef.current = now + QR_CODE_EXPIRY_MS;
      tokenRef.current = token;
      sessionIdRef.current = id;

      setSessionId(id);
      setPairingToken(token);

      const result = await CustomerDisplayServer.startServer({
        port: WS_SERVER_PORT,
        sessionId: id,
        token,
      });
      setServerIp(result.ip);
      setServerPort(result.port);
      setServerRunning(true);

      if (cleanupRef.current) cleanupRef.current();
      cleanupRef.current = setupServerListeners(
        (msg: ProtocolMessage) => handleClientMessage(msg),
        () => {
          setCustomerConnected(true);
          toast.success(t('customerDisplay.seller.customerConnected'));
        },
        () => {
          setCustomerConnected(false);
          setCustomerDisplayId(null);
          if (pendingRequestRef.current) {
            setPendingRequest(null);
            pendingRequestRef.current = null;
          }
          toast.warning(t('customerDisplay.seller.customerDisconnected'));
        }
      );

      toast.success(t('customerDisplay.seller.serverStarted'));
    } catch (err) {
      console.error('Failed to start server:', err);
      toast.error(t('customerDisplay.seller.serverFailed'));
    } finally {
      setLoading(false);
    }
  }, [handleClientMessage, t]);

  const stopServer = useCallback(async () => {
    try {
      await CustomerDisplayServer.stopServer();
    } catch {}
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setServerRunning(false);
    setCustomerConnected(false);
    setCustomerDisplayId(null);
    setPendingRequest(null);
    pendingRequestRef.current = null;
  }, []);

  const regenerateQr = useCallback(() => {
    if (!serverRunning) return;
    const id = generateSessionId();
    const token = generatePairingToken();
    const now = Date.now();
    qrExpiresAtRef.current = now + QR_CODE_EXPIRY_MS;
    tokenRef.current = token;
    sessionIdRef.current = id;

    setSessionId(id);
    setPairingToken(token);
    setCustomerConnected(false);
    setCustomerDisplayId(null);
    setPendingRequest(null);
    pendingRequestRef.current = null;
    toast.info(t('customerDisplay.seller.qrRegenerated'));
  }, [serverRunning, t]);

  const approveRequest = useCallback((): PendingCustomerRequest | null => {
    const req = pendingRequestRef.current;
    if (!req) return null;
    setPendingRequest(null);
    pendingRequestRef.current = null;
    setCustomerTransferPending(req.requestId);
    return req;
  }, []);

  const rejectRequest = useCallback(async () => {
    const req = pendingRequestRef.current;
    if (!req) return;
    setPendingRequest(null);
    pendingRequestRef.current = null;
    await sendServerMessage({
      type: 'transfer-result',
      requestId: req.requestId,
      status: 'failed',
      message: t('customerDisplay.seller.rejectedBySeller'),
    });
  }, [t]);

  const qrData = serverRunning && sessionId
    ? JSON.stringify({
        ip: serverIp,
        port: serverPort,
        sessionId,
        token: pairingToken,
        protocolVersion: CUSTOMER_DISPLAY_PROTOCOL_VERSION,
        expiresAt: qrExpiresAtRef.current,
        sellerDeviceId: 'seller',
      })
    : '';

  const value: CustomerDisplayServerContext = {
    serverRunning,
    serverIp,
    serverPort,
    sessionId,
    pairingToken,
    customerConnected,
    customerDisplayId,
    loading,
    pendingRequest,
    qrData,
    startServer,
    stopServer,
    regenerateQr,
    approveRequest,
    rejectRequest,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}
