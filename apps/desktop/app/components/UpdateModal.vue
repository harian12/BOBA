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
            <p class="text-[11px] text-slate-400">Periksa dan unduh versi rilis terbaru BOBA</p>
          </div>
        </div>
        <button
          @click="$emit('close')"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 transition text-sm"
        >
          ✕
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="py-8 flex flex-col items-center justify-center space-y-3">
        <div class="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-xs text-slate-400 font-mono">Memeriksa rilis terbaru di GitHub...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="errorMessage" class="bg-rose-950/50 border border-rose-800/60 p-4 rounded-xl space-y-3">
        <div class="flex items-start space-x-2 text-rose-300 text-xs">
          <span class="text-sm shrink-0">⚠️</span>
          <div class="flex-1 font-mono break-all">{{ errorMessage }}</div>
        </div>
        <div class="flex justify-end">
          <button
            @click="checkForUpdate"
            class="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-100 text-xs rounded-lg transition font-medium"
          >
            Coba Lagi
          </button>
        </div>
      </div>

      <!-- Result State -->
      <div v-else-if="updateInfo" class="space-y-4">
        <!-- Status Banner -->
        <div
          :class="[
            'p-4 rounded-xl border flex items-center space-x-3.5',
            updateInfo.has_update
              ? 'bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border-sky-500/50 text-sky-100'
              : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-200'
          ]"
        >
          <div class="text-2xl shrink-0">
            {{ updateInfo.has_update ? '✨' : '✅' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-400">
              {{ updateInfo.has_update ? 'Versi Baru Tersedia' : 'Aplikasi Terkini' }}
            </div>
            <div class="text-sm font-semibold truncate mt-0.5">
              {{ updateInfo.has_update ? `BOBA v${updateInfo.latest_version}` : `BOBA v${updateInfo.current_version} sudah versi terbaru` }}
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">
              Versi Terpasang: <span class="font-mono text-slate-300">v{{ updateInfo.current_version }}</span>
              <span v-if="updateInfo.has_update"> → Terbaru: <span class="font-mono text-sky-400 font-bold">v{{ updateInfo.latest_version }}</span></span>
            </div>
          </div>
        </div>

        <!-- Release Notes & Changelog (if update is available or requested) -->
        <div v-if="updateInfo.has_update && updateInfo.release_notes" class="space-y-1.5">
          <div class="flex items-center justify-between text-xs text-slate-400">
            <span class="font-semibold uppercase tracking-wider text-[10px]">Catatan Rilis (Changelog):</span>
            <span v-if="updateInfo.published_at" class="font-mono text-[10px] text-slate-500">
              {{ formatDate(updateInfo.published_at) }}
            </span>
          </div>
          <div class="max-h-48 overflow-y-auto p-3 bg-boba-950 rounded-xl border border-boba-800 text-xs text-slate-300 space-y-2 whitespace-pre-wrap font-sans select-text leading-relaxed">
            {{ updateInfo.release_notes }}
          </div>
        </div>

        <!-- Download Assets / Actions -->
        <div v-if="updateInfo.has_update" class="space-y-2">
          <div v-if="updateInfo.assets && updateInfo.assets.length > 0" class="space-y-1.5">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">File Unduhan Installer:</div>
            <div class="space-y-1 max-h-32 overflow-y-auto">
              <div
                v-for="asset in updateInfo.assets"
                :key="asset.name"
                class="flex items-center justify-between px-3 py-2 bg-boba-950/70 border border-boba-800 rounded-lg hover:border-sky-500/50 transition group"
              >
                <div class="flex items-center space-x-2 truncate mr-2">
                  <span class="text-xs">📦</span>
                  <span class="font-mono text-xs text-slate-200 truncate">{{ asset.name }}</span>
                  <span class="text-[10px] text-slate-500 font-mono shrink-0">({{ formatBytes(asset.size) }})</span>
                </div>
                <button
                  @click="openUrl(asset.browser_download_url)"
                  class="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium transition shrink-0 flex items-center space-x-1"
                >
                  <span>⬇️ Unduh</span>
                </button>
              </div>
            </div>
          </div>

          <div class="pt-2 flex items-center space-x-2">
            <button
              @click="openUrl(updateInfo.html_url)"
              class="flex-1 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg transition flex items-center justify-center space-x-1.5"
            >
              <span>🌐</span>
              <span>Buka Halaman Rilis GitHub</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Auto Check Option & Footer -->
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
            v-if="!loading"
            @click="checkForUpdate"
            class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs transition"
          >
            Cek Ulang
          </button>
          <button
            @click="$emit('close')"
            class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 hover:text-white rounded-lg text-xs transition"
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
import { tauriBridge } from '../services/tauriBridge.js';
import type { AppUpdateInfo } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);

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

async function checkForUpdate() {
  loading.value = true;
  errorMessage.value = null;

  try {
    const info = await tauriBridge.checkAppUpdate();
    updateInfo.value = info;
  } catch (err: any) {
    console.error('Update check failed:', err);
    errorMessage.value = String(err?.message || err);
  } finally {
    loading.value = false;
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
      if (!updateInfo.value) {
        checkForUpdate();
      }
    }
  }
);

onMounted(() => {
  loadAutoCheckPreference();
});
</script>
