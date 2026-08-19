export function generateToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSessionId(): string {
  return generateToken(8);
}

export function generateNonce(): string {
  return generateToken(8);
}

export function generatePairingToken(): string {
  return generateToken(16);
}

export function isExpired(expiresAt: number): boolean {
  if (!expiresAt || expiresAt <= 0) return false;
  // Allow 60 seconds grace period for slight clock differences between seller and customer devices
  return Date.now() > (expiresAt + 60000);
}

export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
