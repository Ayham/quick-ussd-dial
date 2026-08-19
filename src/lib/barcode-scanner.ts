import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';

export type ScannerPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

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

export async function scanQrCode(): Promise<string | null> {
  try {
    const perm = await checkCameraPermission();
    if (perm !== 'granted') {
      const req = await requestCameraPermission();
      if (req !== 'granted') return null;
    }

    const result = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode],
    });

    if (result.barcodes && result.barcodes.length > 0) {
      return result.barcodes[0].rawValue || result.barcodes[0].displayValue || null;
    }
  } catch (err) {
    console.error('BarcodeScanner.scan error:', err);
  }
  return null;
}

export async function openCameraSettings(): Promise<void> {
  try {
    await BarcodeScanner.openSettings();
  } catch {}
}
