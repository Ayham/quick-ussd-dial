export const CUSTOMER_DISPLAY_PROTOCOL_VERSION = 1;

export const PAIRING_TOKEN_LENGTH = 32;
export const SESSION_ID_LENGTH = 16;
export const NONCE_LENGTH = 16;

export const TRANSFER_REQUEST_EXPIRY_MS = 10 * 60 * 1000;

export const WS_SERVER_PORT = 8765;
export const WS_RECONNECT_DELAY_MS = 2000;
export const WS_PING_INTERVAL_MS = 15000;
export const WS_PING_TIMEOUT_MS = 5000;

// Auto-reconnect: attempts with growing delays before giving up
export const RECONNECT_ATTEMPTS = 6;
export const RECONNECT_DELAYS_MS = [2000, 3000, 5000, 8000, 12000, 20000];

export const MAX_CUSTOMER_DISPLAYS = 1;

export const STORAGE_KEY_APP_MODE = 'raseed-app-mode';
export const STORAGE_KEY_CUSTOMER_SESSION = 'raseed-customer-session';
export const STORAGE_KEY_SELLER_SESSION_ID = 'raseed-cd-seller-session-id';
export const STORAGE_KEY_SELLER_PAIRING_TOKEN = 'raseed-cd-seller-token';

export const CUSTOMER_DISPLAY_ROUTE = '/customer-display';
export const SELLER_DISPLAY_ROUTE = '/seller-display';
