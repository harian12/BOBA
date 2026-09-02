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
        <span class="w-2 h-2 rounded-full" :class="queueStore.activeTransfers.length > 0 ? 'bg-sky-400 animate-ping' : 'bg-emerald-400'"></span>
        <span class="font-bold text-sky-300">
          {{ queueStore.activeTransfers.length > 0 ? `${queueStore.activeTransfers.length} Transfers` : 'Transfers Done' }}
        </span>
      </div>

      <span class="text-slate-500">|</span>

      <span v-if="queueStore.activeTransfers.length > 0" class="text-slate-300">
        {{ formatSpeed(queueStore.totalSpeedBps) }} ({{ queueStore.overallPercentage }}%)
      </span>
      <span v-else class="text-emerald-400 font-sans text-[11px]">
        All completed
      </span>

      <span class="text-slate-400 group-hover:text-white transition text-[10px]">▲</span>
    </div>

    <!-- Expanded Floating Card Panel -->
    <div
      v-else
      class="w-96 bg-[#10131d]/95 backdrop-blur-md border border-[#283245] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-96"
    >
      <!-- Header -->
      <div class="h-9 bg-[#151926] border-b border-[#232a3b] px-3 flex items-center justify-between text-xs font-mono text-slate-200 shrink-0">
        <div class="flex items-center space-x-2">
          <span class="text-sky-400">⚡</span>
          <span class="font-bold">SFTP Transfers ({{ queueStore.transfers.length }})</span>
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
            title="Clear completed & cancelled transfers"
          >
            Clear
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

      <!-- Overall Global Progress Bar (if active transfers exist) -->
      <div v-if="queueStore.activeTransfers.length > 0" class="w-full bg-[#1c2233] h-1">
        <div
          class="bg-gradient-to-r from-sky-500 to-indigo-500 h-full transition-all duration-200"
          :style="{ width: `${queueStore.overallPercentage}%` }"
        ></div>
      </div>

      <!-- Transfer Items List -->
      <div class="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
        <div
          v-for="item in queueStore.transfers"
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

            <!-- Cancel / Remove -->
            <div class="flex items-center space-x-1 shrink-0">
              <button
                v-if="item.status === 'transferring' || item.status === 'pending'"
                @click.stop="queueStore.cancelTransfer(item.id)"
                class="text-slate-400 hover:text-rose-400 text-[10px] p-0.5 rounded transition"
                title="Cancel transfer"
              >
                ✕ Cancel
              </button>
              <button
                v-else
                @click.stop="queueStore.removeTransfer(item.id)"
                class="text-slate-500 hover:text-slate-300 text-[10px] p-0.5 rounded transition"
                title="Remove from list"
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

          <!-- Bottom Meta: Transferred bytes / Total, Speed, ETA, Status -->
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
                ✓ Completed
              </span>
              <span v-else-if="item.status === 'cancelled'" class="text-amber-400">
                Cancelled
              </span>
              <span v-else-if="item.status === 'error'" class="text-rose-400" :title="item.errorMessage">
                Failed
              </span>
              <span v-else class="text-slate-500">
                Starting...
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTransferQueueStore, type TransferItem } from '../stores/transferQueueStore.js';

const queueStore = useTransferQueueStore();

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
