import { ref, computed, shallowRef } from 'vue';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'up-to-date' | 'error';

type CheckResult = {
  nativeCheckFailed: boolean;
  updateAvailable: boolean;
};

const status = ref<UpdateStatus>('idle');
const statusMessage = ref('');
const rawUpdate = shallowRef<Update | null>(null);
const downloadProgress = ref(0);
const downloadedBytes = ref(0);
const totalBytes = ref(0);
const currentAppVersion = ref('0.1.8');
const newVersion = ref('');
const releaseNotes = ref('');
let checkInFlight: Promise<CheckResult> | null = null;
let installInFlight: Promise<void> | null = null;

export function useUpdater() {
  const isChecking = computed(() => status.value === 'checking');
  const isDownloading = computed(() => status.value === 'downloading');
  const isInstalling = computed(() => status.value === 'installing');
  const hasNativeUpdate = computed(() => status.value === 'available');
  const hasUpdate = computed(() => hasNativeUpdate.value);

  const fetchCurrentVersion = async () => {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const version = await getVersion();
        if (version) currentAppVersion.value = version;
      }
    } catch {
      currentAppVersion.value = '0.1.8';
    }
  };

  const runNativeCheck = async (): Promise<CheckResult> => {
    await fetchCurrentVersion();
    status.value = 'checking';
    statusMessage.value = 'Memeriksa pembaruan...';

    try {
      const update = await check();

      if (update?.available) {
        rawUpdate.value = update;
        newVersion.value = update.version;
        releaseNotes.value = update.body || '';
        status.value = 'available';
        statusMessage.value = `Versi v${update.version} tersedia!`;
        return { nativeCheckFailed: false, updateAvailable: true };
      }

      rawUpdate.value = null;
      status.value = 'up-to-date';
      statusMessage.value = `Aplikasi sudah versi terbaru (v${currentAppVersion.value}).`;
      return { nativeCheckFailed: false, updateAvailable: false };
    } catch (err: unknown) {
      console.error('Error checking for updates:', err);
      rawUpdate.value = null;
      status.value = 'error';
      const detail = err instanceof Error
        ? err.message
        : (typeof err === 'string' ? err : 'Gagal terhubung ke server update');
      statusMessage.value = `Gagal memeriksa: ${detail}`;
      return { nativeCheckFailed: true, updateAvailable: false };
    }
  };

  const checkForUpdates = (): Promise<CheckResult> => {
    if (checkInFlight) return checkInFlight;

    const pendingCheck = runNativeCheck();
    checkInFlight = pendingCheck;
    void pendingCheck.finally(() => {
      if (checkInFlight === pendingCheck) checkInFlight = null;
    });

    return pendingCheck;
  };

  const downloadAndInstall = () => {
    if (installInFlight) return installInFlight;
    const update = rawUpdate.value;
    if (!update) return Promise.resolve();

    const pendingInstall = (async () => {
      try {
        status.value = 'downloading';
        downloadProgress.value = 0;
        downloadedBytes.value = 0;
        totalBytes.value = 0;
        statusMessage.value = 'Mengunduh pembaruan...';

        let downloaded = 0;
        let total = 0;

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              total = event.data.contentLength || 0;
              totalBytes.value = total;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              downloadedBytes.value = downloaded;
              if (total > 0) {
                downloadProgress.value = Math.min(100, Math.round((downloaded / total) * 100));
              }
              break;
            case 'Finished':
              downloadProgress.value = 100;
              status.value = 'installing';
              statusMessage.value = 'Pembaruan diunduh. Memasang pembaruan...';
              break;
          }
        });
      } catch (err: unknown) {
        console.error('Gagal memasang pembaruan:', err);
        status.value = 'error';
        const detail = err instanceof Error
          ? err.message
          : (typeof err === 'string' ? err : 'Gagal memasang pembaruan');
        statusMessage.value = `Gagal memasang: ${detail}`;
      }
    })();

    installInFlight = pendingInstall;
    void pendingInstall.finally(() => {
      if (installInFlight === pendingInstall) installInFlight = null;
    });

    return pendingInstall;
  };

  return {
    status,
    statusMessage,
    downloadProgress,
    downloadedBytes,
    totalBytes,
    currentAppVersion,
    newVersion,
    releaseNotes,
    isChecking,
    isDownloading,
    isInstalling,
    hasNativeUpdate,
    hasUpdate,
    fetchCurrentVersion,
    checkForUpdates,
    downloadAndInstall,
  };
}
