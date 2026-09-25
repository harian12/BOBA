<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 text-base">
            🚀
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-100">Pembaruan Aplikasi</h3>
            <p class="text-[11px] text-slate-400">Pembaruan otomatis in-app dan status rilis BOBA</p>
          </div>
        </div>
        <button
          @click="handleClose"
          :disabled="isDownloading"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 disabled:opacity-40 transition text-sm"
        >
          ✕
        </button>
      </div>

      <!-- Loading / Checking State -->
      <div v-if="isChecking || loading" class="py-8 flex flex-col items-center justify-center space-y-3">
        <div class="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-xs text-slate-400 font-mono">Memeriksa rilis terbaru...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="status === 'error' || errorMessage" class="bg-rose-950/50 border border-rose-800/60 p-4 rounded-xl space-y-3">
        <div class="flex items-start space-x-2 text-rose-300 text-xs">
          <span class="text-sm shrink-0">⚠️</span>
          <div class="flex-1 font-mono break-all">{{ statusMessage || errorMessage }}</div>
        </div>
        <div class="flex justify-end">
          <button
            @click="runCheck"
            class="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-100 text-xs rounded-lg transition font-medium"
          >
            Coba Lagi
          </button>
        </div>
      </div>

      <!-- Main Result State -->
      <div v-else class="space-y-4">
        <!-- Status Banner -->
        <div
          :class="[
            'p-4 rounded-xl border flex items-center space-x-3.5',
            hasUpdate
              ? 'bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border-sky-500/50 text-sky-100'
              : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-200'
          ]"
        >
          <div class="text-2xl shrink-0">
            {{ hasUpdate ? '✨' : '✅' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-400">
              {{ hasUpdate ? 'Versi Baru Tersedia' : 'Aplikasi Terkini' }}
            </div>
            <div class="text-sm font-semibold truncate mt-0.5">
              {{ hasUpdate ? `BOBA v${newVersion || updateInfo?.latest_version}` : `BOBA v${currentAppVersion} sudah versi terbaru` }}
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">
              Versi Terpasang: <span class="font-mono text-slate-300">v{{ currentAppVersion }}</span>
              <span v-if="hasUpdate"> → Terbaru: <span class="font-mono text-sky-400 font-bold">v{{ newVersion || updateInfo?.latest_version }}</span></span>
            </div>
          </div>
        </div>

        <!-- Release Notes & Changelog -->
        <div v-if="hasUpdate && (releaseNotes || updateInfo?.release_notes)" class="space-y-1.5">
          <div class="flex items-center justify-between text-xs text-slate-400">
            <span class="font-semibold uppercase tracking-wider text-[10px]">Catatan Rilis (Changelog):</span>
            <span v-if="updateInfo?.published_at" class="font-mono text-[10px] text-slate-500">
              {{ formatDate(updateInfo.published_at) }}
            </span>
          </div>
          <div class="max-h-40 overflow-y-auto p-3 bg-boba-950 rounded-xl border border-boba-800 text-xs text-slate-300 space-y-2 whitespace-pre-wrap font-sans select-text leading-relaxed">
            {{ releaseNotes || updateInfo?.release_notes }}
          </div>
        </div>

        <!-- In-App Download Progress Bar -->
        <div v-if="isDownloading || status === 'downloaded'" class="space-y-2 p-3 bg-boba-950 rounded-xl border border-sky-500/30">
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-300 font-medium flex items-center space-x-1.5">
              <span v-if="isDownloading" class="inline-block w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
              <span>{{ statusMessage }}</span>
            </span>
            <span class="font-mono text-sky-400 font-bold">{{ downloadProgress }}%</span>
          </div>
          <div class="w-full h-2.5 bg-boba-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-200"
              :style="{ width: `${downloadProgress}%` }"
            ></div>
          </div>
          <div v-if="totalBytes > 0" class="flex justify-between text-[10px] font-mono text-slate-400">
            <span>{{ formatBytes(downloadedBytes) }} / {{ formatBytes(totalBytes) }}</span>
            <span>Otomatis me-restart setelah selesai</span>
          </div>
        </div>

        <!-- Primary Actions -->
        <div v-if="hasUpdate" class="space-y-2 pt-1">
          <button
            @click="handleInstallClick"
            :disabled="isDownloading"
            class="w-full py-2.5 bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-lg shadow-sky-900/20 transition flex items-center justify-center space-x-2"
          >
            <span v-if="isDownloading" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            <span v-else>🚀</span>
            <span>{{ isDownloading ? 'Sedang Mengunduh...' : (status === 'downloaded' ? 'Mulai Ulang Sekarang' : 'Pasang Pembaruan Langsung') }}</span>
          </button>

          <!-- Fallback direct download link -->
          <div class="flex items-center justify-center pt-1">
            <button
              @click="openUrl(updateInfo?.html_url || 'https://github.com/harian12/BOBA/releases/latest')"
              class="text-[11px] text-slate-400 hover:text-sky-300 underline underline-offset-2 transition"
            >
              Atau buka rilis di browser GitHub 🌐
            </button>
          </div>
        </div>
      </div>

      <!-- Footer & Auto Check Checkbox -->
      <div class="border-t border-boba-800 pt-3.5 flex items-center justify-between text-xs">
        <label class="flex items-center space-x-2 cursor-pointer text-slate-400 hover:text-slate-200 transition">
          <input
            v-model="autoCheckEnabled"
            type="checkbox"
            @change="saveAutoCheckPreference"
            class="rounded border-boba-700 bg-boba-950 text-sky-500 focus:ring-0"
          />
          <span class="text-[11px]">Cek otomatis saat aplikasi dibuka</span>
        </label>

        <div class="flex items-center space-x-2">
          <button
            v-if="!isChecking && !loading && !isDownloading"
            @click="runCheck"
            class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs transition"
          >
            Cek Ulang
          </button>
          <button
            @click="handleClose"
            :disabled="isDownloading"
            class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 disabled:opacity-40 text-slate-300 hover:text-white rounded-lg text-xs transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useUpdater } from '../composables/useUpdater.js';
import { tauriBridge } from '../services/tauriBridge.js';
import type { AppUpdateInfo } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);

const {
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
  hasUpdate,
  checkForUpdates,
  downloadAndInstall,
} = useUpdater();

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const updateInfo = ref<AppUpdateInfo | null>(null);
const autoCheckEnabled = ref(true);

const AUTO_CHECK_STORAGE_KEY = 'boba_auto_check_update';

function loadAutoCheckPreference() {
  const saved = localStorage.getItem(AUTO_CHECK_STORAGE_KEY);
  if (saved !== null) {
    autoCheckEnabled.value = saved === 'true';
  }
}

function saveAutoCheckPreference() {
  localStorage.setItem(AUTO_CHECK_STORAGE_KEY, String(autoCheckEnabled.value));
}

function handleClose() {
  if (isDownloading.value) return;
  emit('close');
}

async function runCheck() {
  errorMessage.value = null;
  loading.value = true;
  
  try {
    // 1. Cek lewat Tauri Native Plugin Updater
    const tauriFound = await checkForUpdates();
    
    // 2. Fetch metadata rilis dari GitHub API sebagai fallback info
    try {
      const info = await tauriBridge.checkAppUpdate();
      updateInfo.value = info;
    } catch {
      // ignore github api fallback error if tauri handled it
    }
  } catch (err: any) {
    errorMessage.value = String(err?.message || err);
  } finally {
    loading.value = false;
  }
}

async function handleInstallClick() {
  if (status.value === 'downloaded') {
    return;
  }
  
  try {
    await downloadAndInstall();
  } catch (err: any) {
    console.error('Download install error:', err);
  }
}

async function openUrl(url: string) {
  try {
    await tauriBridge.openExternalUrl(url);
  } catch (err) {
    console.error('Failed to open external url:', err);
    window.open(url, '_blank');
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadAutoCheckPreference();
      runCheck();
    }
  }
);

onMounted(() => {
  loadAutoCheckPreference();
});
</script>
