export type AppMode = 'seller' | 'customer-display';

export type PairingState =
  | 'idle'
  | 'generating'
  | 'waiting-for-customer'
  | 'pairing'
  | 'connected'
  | 'error';

export type CustomerConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

export type TransferRequestStatus =
  | 'created'
  | 'sent'
  | 'received'
  | 'pending-approval'
  | 'accepted'
  | 'processing'
  | 'success'
  | 'failed'
  | 'rejected'
  | 'expired'
  | 'disconnected';

export type ProtocolMessage =
  | { type: 'pair'; sessionId: string; token: string; protocolVersion: number }
  | { type: 'pair-ack'; sessionId: string; customerDisplayId: string }
  | { type: 'pair-reject'; reason: string }
  | { type: 'display-config'; presets: unknown; protocolVersion: number }
  | { type: 'transfer-request'; requestId: string; phone: string; amount: number; price: number; nonce: string; timestamp: number; expiresAt: number }
  | { type: 'transfer-request-ack'; requestId: string; status: TransferRequestStatus }
  | { type: 'transfer-result'; requestId: string; status: 'success' | 'failed'; message: string }
  | { type: 'seller-approval-request'; requestId: string; phone: string; amount: number; price: number }
  | { type: 'seller-approval-response'; requestId: string; approved: boolean }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'disconnect'; reason: string };

export interface CustomerDisplaySession {
  sessionId: string;
  sellerDeviceId: string;
  pairingToken: string;
  customerDisplayId: string | null;
  createdAt: number;
  expiresAt: number;
  protocolVersion: number;
  connectionState: PairingState;
}

export interface TransferRequest {
  requestId: string;
  sessionId: string;
  customerDisplayId: string;
  phone: string;
  amount: number;
  price: number;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  status: TransferRequestStatus;
}

export interface QrPairingData {
  ip: string;
  port: number;
  sessionId: string;
  token: string;
  protocolVersion: number;
  expiresAt: number;
  sellerDeviceId: string;
}

export interface DisplayConfig {
  presets: Record<string, Array<{ amount: number; price: number }>>;
  protocolVersion: number;
  businessName?: string;
}
