/**
 * APK Downloader — تنزيل وتثبيت التحديث من داخل التطبيق
 * يستخدم Capacitor Filesystem لتنزيل الـ APK و File Opener لتثبيته
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { isWebBrowser } from './platform';

export interface DownloadProgress {
  progress: number; // 0-100
  status: 'idle' | 'downloading' | 'opening' | 'done' | 'error';
  error?: string;
}

const APK_FILENAME = 'app-update.apk';

/**
 * Download APK from URL and install it
 */
export async function downloadAndInstallApk(
  downloadUrl: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  // On web, just open the URL
  if (isWebBrowser()) {
    window.open(downloadUrl, '_blank');
    return;
  }

  const report = (p: Partial<DownloadProgress>) =>
    onProgress?.({ progress: 0, status: 'idle', ...p });

  try {
    // 1. Delete old APK if exists
    try {
      await Filesystem.deleteFile({
        path: APK_FILENAME,
        directory: Directory.Cache,
      });
    } catch {
      // File doesn't exist, that's fine
    }

    // 2. Download the APK
    report({ status: 'downloading', progress: 10 });

    const result = await Filesystem.downloadFile({
      url: downloadUrl,
      path: APK_FILENAME,
      directory: Directory.Cache,
    });

    if (!result.path) {
      throw new Error('فشل التنزيل - لم يتم الحصول على مسار الملف');
    }

    report({ status: 'downloading', progress: 90 });

    // 3. Get the file URI
    const fileInfo = await Filesystem.getUri({
      path: APK_FILENAME,
      directory: Directory.Cache,
    });

    report({ status: 'opening', progress: 95 });

    // 4. Open the APK for installation
    await FileOpener.openFile({
      path: fileInfo.uri,
    });

    report({ status: 'done', progress: 100 });
  } catch (error: any) {
    const errorMsg = error?.message || 'حدث خطأ أثناء تنزيل التحديث';
    report({ status: 'error', progress: 0, error: errorMsg });
    throw new Error(errorMsg);
  }
}
