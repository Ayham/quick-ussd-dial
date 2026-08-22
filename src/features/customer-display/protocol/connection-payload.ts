import type { QrPairingData } from '../types';
import { CUSTOMER_DISPLAY_PROTOCOL_VERSION } from '../constants';

export type ParseResult =
  | { ok: true; data: QrPairingData }
  | { ok: false; error: string };

export function parseConnectionPayload(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'not_object' };
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.ip !== 'string' || obj.ip.length === 0) {
    return { ok: false, error: 'missing_ip' };
  }
  if (typeof obj.port !== 'number' || obj.port <= 0 || obj.port > 65535) {
    return { ok: false, error: 'missing_port' };
  }
  if (typeof obj.sessionId !== 'string' || obj.sessionId.length === 0) {
    return { ok: false, error: 'missing_session_id' };
  }
  if (typeof obj.token !== 'string' || obj.token.length === 0) {
    return { ok: false, error: 'missing_token' };
  }
  if (typeof obj.protocolVersion !== 'number') {
    return { ok: false, error: 'missing_protocol_version' };
  }
  if (typeof obj.sellerDeviceId !== 'string') {
    return { ok: false, error: 'missing_seller_device_id' };
  }

  if (obj.protocolVersion > CUSTOMER_DISPLAY_PROTOCOL_VERSION) {
    return { ok: false, error: 'unsupported_protocol_version' };
  }

  // Note: expiresAt is no longer required and is never enforced.
  // Pairing data stays valid until the seller explicitly regenerates the QR.

  const data: QrPairingData = {
    ip: obj.ip as string,
    port: obj.port as number,
    sessionId: obj.sessionId as string,
    token: obj.token as string,
    protocolVersion: obj.protocolVersion as number,
    expiresAt: typeof obj.expiresAt === 'number' ? obj.expiresAt : 0,
    sellerDeviceId: obj.sellerDeviceId as string,
  };

  return { ok: true, data };
}

export function getParseErrorTranslation(error: string): string {
  const map: Record<string, string> = {
    invalid_json: 'customerDisplay.customer.errorInvalidJson',
    not_object: 'customerDisplay.customer.errorInvalidData',
    missing_ip: 'customerDisplay.customer.errorMissingFields',
    missing_port: 'customerDisplay.customer.errorMissingFields',
    missing_session_id: 'customerDisplay.customer.errorMissingFields',
    missing_token: 'customerDisplay.customer.errorMissingFields',
    missing_protocol_version: 'customerDisplay.customer.errorMissingFields',
    missing_seller_device_id: 'customerDisplay.customer.errorMissingFields',
    unsupported_protocol_version: 'customerDisplay.customer.errorUnsupportedVersion',
  };
  return map[error] || 'customerDisplay.customer.errorInvalidData';
}
