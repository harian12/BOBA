<template>
  <div
    v-if="queueStore.transfers.length > 0"
    class="fixed bottom-3 right-4 z-40 select-none animate-in slide-in-from-bottom-5 duration-200"
  >
    <!-- Collapsed Pill Mode -->
    <div
      v-if="!queueStore.isTrayExpanded"
      @click="queueStore.isTrayExpanded = true"
      class="bg-[#12151f] hover:bg-[#1a1f2e] border border-sky-500/40 rounded-full px-3.5 py-1.5 shadow-2xl flex items-center space-x-2.5 cursor-pointer text-xs font-mono text-slate-200 transition group"
    >
      <div class="flex items-center space-x-1.5">
        <span
          class="w-2 h-2 rounded-full"
          :class="[
            queueStore.activeTransfers.length > 0
              ? 'bg-sky-400 animate-ping'
              : queueStore.failedTransfers.length > 0
              ? 'bg-rose-400'
              : 'bg-emerald-400'
          ]"
        ></span>
        <span class="font-bold text-sky-300">
          {{ queueStore.activeTransfers.length > 0 ? `${queueStore.activeTransfers.length} Transfers` : 'Transfers' }}
        </span>
      </div>

      <span class="text-slate-500">|</span>

      <span v-if="queueStore.activeTransfers.length > 0" class="text-slate-300">
        {{ formatSpeed(queueStore.totalSpeedBps) }} ({{ queueStore.overallPercentage }}%)
      </span>
      <span v-else-if="queueStore.failedTransfers.length > 0" class="text-rose-400 font-sans text-[11px]">
        {{ queueStore.failedTransfers.length }} Gagal
      </span>
      <span v-else class="text-emerald-400 font-sans text-[11px]">
        Selesai
      </span>

      <span class="text-slate-400 group-hover:text-white transition text-[10px]">▲</span>
    </div>

    <!-- Expanded Floating Card Panel -->
    <div
      v-else
      class="w-96 bg-[#10131d]/95 backdrop-blur-md border border-[#283245] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[28rem]"
    >
      <!-- Header -->
      <div class="h-9 bg-[#151926] border-b border-[#232a3b] px-3 flex items-center justify-between text-xs font-mono text-slate-200 shrink-0">
        <div class="flex items-center space-x-2">
          <span class="text-sky-400">⚡</span>
          <span class="font-bold">SFTP Transfers</span>
          <span v-if="queueStore.activeTransfers.length > 0" class="text-[10px] text-sky-400 font-sans">
            • {{ formatSpeed(queueStore.totalSpeedBps) }}
          </span>
        </div>

        <div class="flex items-center space-x-1.5">
          <!-- Clear Finished Button -->
          <button
            v-if="queueStore.completedTransfers.length > 0 || queueStore.failedTransfers.length > 0"
            @click.stop="queueStore.clearCompleted"
            class="hover:text-sky-300 text-slate-400 text-[10px] px-1.5 py-0.5 rounded hover:bg-[#202738] transition"
            title="Bersihkan transfer yang sudah selesai/dibatalkan"
          >
            Bersihkan
          </button>

          <!-- Minimize Button -->
          <button
            @click.stop="queueStore.isTrayExpanded = false"
            class="hover:text-white text-slate-400 text-xs px-1 py-0.5 rounded hover:bg-[#202738] transition"
            title="Minimize tray"
          >
            ▼
          </button>
        </div>
      </div>

      <!-- 3 Navigation Tabs (Berjalan, Sukses, Gagal) -->
      <div class="flex border-b border-[#232a3b] bg-[#121622] text-[11px] font-medium shrink-0">
        <!-- Tab 1: Berjalan -->
        <button
          @click="activeTab = 'active'"
          :class="[
            'flex-1 py-2 px-2 text-center transition flex items-center justify-center space-x-1.5 border-b-2',
            activeTab === 'active'
              ? 'border-sky-500 text-sky-400 bg-sky-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          ]"
        >
          <span>Berjalan</span>
          <span
            v-if="queueStore.activeTransfers.length > 0"
            class="px-1.5 py-0.2 rounded-full text-[9px] bg-sky-500/20 text-sky-300 font-mono"
          >
            {{ queueStore.activeTransfers.length }}
          </span>
        </button>

        <!-- Tab 2: Sukses -->
        <button
          @click="activeTab = 'completed'"
          :class="[
            'flex-1 py-2 px-2 text-center transition flex items-center justify-center space-x-1.5 border-b-2',
            activeTab === 'completed'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          ]"
        >
          <span>Sukses</span>
          <span
            v-if="queueStore.completedTransfers.length > 0"
            class="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/20 text-emerald-300 font-mono"
          >
            {{ queueStore.completedTransfers.length }}
          </span>
        </button>

        <!-- Tab 3: Gagal / Terputus -->
        <button
          @click="activeTab = 'failed'"
          :class="[
            'flex-1 py-2 px-2 text-center transition flex items-center justify-center space-x-1.5 border-b-2',
            activeTab === 'failed'
              ? 'border-rose-500 text-rose-400 bg-rose-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          ]"
        >
          <span>Gagal</span>
          <span
            v-if="queueStore.failedTransfers.length > 0"
            class="px-1.5 py-0.2 rounded-full text-[9px] bg-rose-500/20 text-rose-300 font-mono"
          >
            {{ queueStore.failedTransfers.length }}
          </span>
        </button>
      </div>

      <!-- Overall Global Progress Bar (if on active tab & transfers running) -->
      <div v-if="activeTab === 'active' && queueStore.activeTransfers.length > 0" class="w-full bg-[#1c2233] h-1">
        <div
          class="bg-gradient-to-r from-sky-500 to-indigo-500 h-full transition-all duration-200"
          :style="{ width: `${queueStore.overallPercentage}%` }"
        ></div>
      </div>

      <!-- Transfer Items List -->
      <div class="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
        <!-- Empty States -->
        <div v-if="currentTabItems.length === 0" class="p-6 text-center text-xs text-slate-500 font-mono">
          <span v-if="activeTab === 'active'">Tidak ada transfer yang sedang berjalan.</span>
          <span v-else-if="activeTab === 'completed'">Belum ada transfer yang berhasil selesai.</span>
          <span v-else>Tidak ada transfer yang gagal atau terputus.</span>
        </div>

        <!-- Items -->
        <div
          v-for="item in currentTabItems"
          :key="item.id"
          class="bg-[#161a26] border border-[#232a3b] rounded-lg p-2.5 text-xs font-mono space-y-1.5 relative group/item"
        >
          <!-- Top row: Icon, Name, Actions -->
          <div class="flex items-center justify-between text-[11px]">
            <div class="flex items-center space-x-2 truncate flex-1 mr-2">
              <span>{{ item.direction === 'upload' ? '⬆️' : '⬇️' }}</span>
              <span class="text-slate-100 font-semibold truncate" :title="item.remotePath">
                {{ item.fileName }}
              </span>
            </div>

            <!-- Action buttons per status -->
            <div class="flex items-center space-x-1 shrink-0">
              <!-- Cancel when in progress -->
              <button
                v-if="item.status === 'transferring' || item.status === 'pending'"
                @click.stop="queueStore.cancelTransfer(item.id)"
                class="text-slate-400 hover:text-rose-400 text-[10px] px-1.5 py-0.5 rounded hover:bg-[#202738] transition"
                title="Batalkan transfer"
              >
                ✕ Cancel
              </button>

              <!-- Resume Button on Failed tab -->
              <button
                v-if="item.status === 'error' || item.status === 'cancelled'"
                @click.stop="handleResume(item.id)"
                class="text-sky-400 hover:text-sky-300 text-[10px] px-1.5 py-0.5 rounded bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/60 transition flex items-center space-x-1"
                title="Lanjutkan transfer dari byte terakhir"
              >
                <span>⚡</span>
                <span>Resume</span>
              </button>

              <!-- Restart from beginning on Failed tab -->
              <button
                v-if="item.status === 'error' || item.status === 'cancelled'"
                @click.stop="handleRestart(item.id)"
                class="text-amber-400 hover:text-amber-300 text-[10px] px-1.5 py-0.5 rounded hover:bg-amber-950/40 transition"
                title="Ulang transfer dari 0%"
              >
                🔄
              </button>

              <!-- Remove / Delete from list -->
              <button
                v-if="item.status !== 'transferring' && item.status !== 'pending'"
                @click.stop="queueStore.removeTransfer(item.id)"
                class="text-slate-500 hover:text-slate-300 text-[10px] p-0.5 rounded transition"
                title="Hapus dari daftar"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="w-full bg-[#0d1017] rounded-full h-1.5 overflow-hidden">
            <div
              :class="[
                'h-full transition-all duration-150',
                item.status === 'completed'
                  ? 'bg-emerald-400'
                  : item.status === 'error' || item.status === 'cancelled'
                  ? 'bg-rose-500'
                  : 'bg-sky-400'
              ]"
              :style="{ width: `${item.percentage}%` }"
            ></div>
          </div>

          <!-- Bottom Meta: Transferred bytes / Total, Speed, Status -->
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <div class="flex items-center space-x-1">
              <span>{{ formatSize(item.bytesTransferred) }}</span>
              <span v-if="item.totalBytes > 0">/ {{ formatSize(item.totalBytes) }}</span>
              <span>({{ Math.round(item.percentage) }}%)</span>
            </div>

            <div>
              <span v-if="item.status === 'transferring'" class="text-sky-300">
                {{ formatSpeed(item.speedBps) }}
                <span v-if="calculateEta(item)" class="text-slate-500 hidden sm:inline">• ETA {{ calculateEta(item) }}</span>
              </span>
              <span v-else-if="item.status === 'completed'" class="text-emerald-400 font-semibold">
                ✓ Selesai
              </span>
              <span v-else-if="item.status === 'cancelled'" class="text-amber-400">
                Dibatalkan
              </span>
              <span v-else-if="item.status === 'error'" class="text-rose-400 flex items-center space-x-1" :title="item.errorMessage">
                <span>⚠️ Gagal (Terputus)</span>
              </span>
              <span v-else class="text-slate-500">
                Memulai...
              </span>
            </div>
          </div>

          <!-- Error details message for failed items -->
          <div
            v-if="(item.status === 'error' || item.status === 'cancelled') && item.errorMessage"
            class="text-[10px] text-rose-300/80 bg-rose-950/30 px-2 py-1 rounded border border-rose-900/30 truncate"
            :title="item.errorMessage"
          >
            {{ item.errorMessage }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTransferQueueStore, type TransferItem } from '../stores/transferQueueStore.js';

const queueStore = useTransferQueueStore();
const activeTab = ref<'active' | 'completed' | 'failed'>('active');

const currentTabItems = computed(() => {
  if (activeTab.value === 'active') {
    return queueStore.activeTransfers;
  } else if (activeTab.value === 'completed') {
    return queueStore.completedTransfers;
  } else {
    return queueStore.failedTransfers;
  }
});

async function handleResume(id: string) {
  await queueStore.resumeTransfer(id);
}

async function handleRestart(id: string) {
  await queueStore.restartTransfer(id);
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bps: number): string {
  if (!bps || bps <= 0) return '0 KB/s';
  const k = 1024;
  if (bps < k) return `${bps.toFixed(0)} B/s`;
  if (bps < k * k) return `${(bps / k).toFixed(1)} KB/s`;
  return `${(bps / (k * k)).toFixed(1)} MB/s`;
}

function calculateEta(item: TransferItem): string {
  if (!item.speedBps || item.speedBps <= 0 || !item.totalBytes) return '';
  const remainingBytes = item.totalBytes - item.bytesTransferred;
  if (remainingBytes <= 0) return '';
  const seconds = Math.round(remainingBytes / item.speedBps);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  return `${minutes}m ${remainingSecs}s`;
}
</script>
