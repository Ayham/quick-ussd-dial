import type { ProtocolMessage } from './types';
import { sendServerMessage } from './protocol/messaging';

let pendingResult: { requestId: string } | null = null;

export function setCustomerTransferPending(requestId: string) {
  pendingResult = { requestId };
}

export async function sendCustomerTransferResult(status: 'success' | 'failed', message: string) {
  if (!pendingResult) return;
  const req = pendingResult;
  pendingResult = null;

  try {
    const msg: ProtocolMessage = {
      type: 'transfer-result',
      requestId: req.requestId,
      status,
      message,
    };
    await sendServerMessage(msg);
  } catch (err) {
    console.warn('[CustomerDisplay] Failed to send transfer result:', err);
  }
}

export function clearCustomerTransferPending() {
  pendingResult = null;
}
