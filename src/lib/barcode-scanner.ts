import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import type { PluginListenerHandle } from '@capacitor/core';

export type ScannerPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

export type ScanQrResult =
  | { status: 'ok'; value: string }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'error'; message?: string };

export interface QrScanSession {
  cancel: () => void;
  toggleTorch: () => Promise<void>;
  done: Promise<ScanQrResult>;
}

function extractErrorMessage(err: unknown): string | undefined {
  if (!err) return undefined;
  if (typeof err === 'string') return err;
  const e = err as { message?: string; code?: number | string };
  const parts = [e.message, e.code !== undefined ? `code=${e.code}` : undefined];
  const joined = parts.filter(Boolean).join(' ').trim();
  return joined || undefined;
}

export async function checkCameraPermission(): Promise<ScannerPermissionStatus> {
  try {
    const status = await BarcodeScanner.checkPermissions();
    if (status.camera === 'granted' || status.camera === 'limited') return 'granted';
    if (status.camera === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unknown';
  }
}

export async function requestCameraPermission(): Promise<ScannerPermissionStatus> {
  try {
    const status = await BarcodeScanner.requestPermissions();
    if (status.camera === 'granted' || status.camera === 'limited') return 'granted';
    if (status.camera === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unknown';
  }
}

export async function openCameraSettings(): Promise<void> {
  try {
    await BarcodeScanner.openSettings();
  } catch {}
}

/**
 * Bundled ML Kit scan session - works completely offline.
 * Uses startScan() (CameraX + on-device model compiled into the APK),
 * NOT the Google Play Services code scanner activity which requires
 * a downloadable GMS module that can break without any app update.
 */
export async function startBundledQrScan(): Promise<QrScanSession> {
  let perm = await checkCameraPermission();
  if (perm !== 'granted') {
    perm = await requestCameraPermission();
    if (perm !== 'granted') {
      return { cancel: () => {}, toggleTorch: async () => {}, done: Promise.resolve({ status: 'denied' }) };
    }
  }

  let settle!: (r: ScanQrResult) => void;
  const done = new Promise<ScanQrResult>((resolve) => { settle = resolve; });

  let listenerHandle: PluginListenerHandle | null = null;
  let torchOn = false;
  let settled = false;

  const cleanup = async () => {
    try { await listenerHandle?.remove(); } catch {}
    listenerHandle = null;
    try { if (torchOn) await BarcodeScanner.disableTorch(); } catch {}
    torchOn = false;
    try { await BarcodeScanner.stopScan(); } catch {}
  };

  const finish = (result: ScanQrResult) => {
    if (settled) return;
    settled = true;
    settle(result);
    void cleanup();
  };

  try {
    listenerHandle = await BarcodeScanner.addListener('barcodesScanned', (event) => {
      const barcode = event.barcodes?.[0];
      const value = barcode?.rawValue || barcode?.displayValue;
      if (value) finish({ status: 'ok', value });
    });
    await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] });
  } catch (err) {
    console.error('BarcodeScanner.startScan error:', err);
    await cleanup();
    settled = true;
    settle({ status: 'error', message: extractErrorMessage(err) });
  }

  return {
    cancel: () => finish({ status: 'cancelled' }),
    toggleTorch: async () => {
      try {
        await BarcodeScanner.toggleTorch();
        torchOn = !torchOn;
      } catch {}
    },
    done,
  };
}
