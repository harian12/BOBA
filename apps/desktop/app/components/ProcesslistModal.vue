<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto font-sans">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Icon icon="lucide:activity" class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-100">Live Processlist & Query Killer</h3>
            <p class="text-[11px] text-slate-400">Pantau proses & query aktif secara real-time dan hentikan query macet</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button
            @click="loadProcesslist"
            :disabled="loading"
            class="px-3 py-1 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs transition flex items-center space-x-1.5"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']" />
            <span>Refresh</span>
          </button>
          <button
            @click="$emit('close')"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 transition text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Process Table -->
      <div class="border border-boba-800 rounded-xl overflow-hidden bg-boba-950/80 font-mono text-xs">
        <div v-if="loading" class="py-12 text-center text-slate-500 text-xs">
          Memuat daftar proses aktif...
        </div>

        <div v-else-if="processes.length === 0" class="py-12 text-center text-slate-500 text-xs">
          Tidak ada proses aktif yang berjalan.
        </div>

        <div v-else class="overflow-x-auto max-h-[50vh]">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#141a29] sticky top-0 border-b border-boba-800 text-slate-300">
              <tr>
                <th class="px-3 py-2 border-r border-boba-800 w-16">PID</th>
                <th class="px-3 py-2 border-r border-boba-800">User</th>
                <th class="px-3 py-2 border-r border-boba-800">Host</th>
                <th class="px-3 py-2 border-r border-boba-800">Database</th>
                <th class="px-3 py-2 border-r border-boba-800">Waktu</th>
                <th class="px-3 py-2 border-r border-boba-800">State</th>
                <th class="px-3 py-2 border-r border-boba-800">Query / Info</th>
                <th class="px-3 py-2 text-center w-20">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-boba-850">
              <tr v-for="p in processes" :key="p.id" class="hover:bg-boba-800/40 transition group">
                <td class="px-3 py-1.5 font-bold text-sky-400 border-r border-boba-850">{{ p.id }}</td>
                <td class="px-3 py-1.5 text-slate-300 border-r border-boba-850">{{ p.user }}</td>
                <td class="px-3 py-1.5 text-slate-400 border-r border-boba-850">{{ p.host }}</td>
                <td class="px-3 py-1.5 text-amber-300 border-r border-boba-850">{{ p.db || '-' }}</td>
                <td class="px-3 py-1.5 text-emerald-400 border-r border-boba-850">{{ p.time_seconds }}s</td>
                <td class="px-3 py-1.5 text-slate-400 border-r border-boba-850">{{ p.state || '-' }}</td>
                <td class="px-3 py-1.5 text-slate-300 border-r border-boba-850 max-w-xs truncate" :title="p.info || p.command">
                  {{ p.info || p.command }}
                </td>
                <td class="px-2 py-1.5 text-center">
                  <button
                    @click="handleKillProcess(p.id)"
                    class="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-700 text-rose-300 hover:text-white rounded border border-rose-800 text-[11px] font-semibold transition"
                    title="Hentikan / Matikan Process ini"
                  >
                    Kill
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Footer -->
      <div class="border-t border-boba-800 pt-3 flex items-center justify-between text-xs text-slate-400">
        <div>Total: <strong class="text-slate-200">{{ processes.length }}</strong> proses terdaftar</div>
        <button
          @click="$emit('close')"
          class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs"
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useDialogStore } from '../stores/dialogStore.js';
import type { DbConnectionConfig, DbProcessItem } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
  dbConfig?: DbConnectionConfig | null;
}>();

defineEmits(['close']);

const dialogStore = useDialogStore();

const loading = ref(false);
const processes = ref<DbProcessItem[]>([]);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadProcesslist();
    }
  }
);

async function loadProcesslist() {
  if (!props.dbConfig) return;
  loading.value = true;

  try {
    const list = await tauriBridge.dbmsGetProcesslist(props.dbConfig);
    processes.value = list;
  } catch (err: any) {
    console.error('Failed to load processlist:', err);
  } finally {
    loading.value = false;
  }
}

async function handleKillProcess(processId: number) {
  if (!props.dbConfig) return;
  const confirm = await dialogStore.confirm({
    title: `Hentikan Process PID ${processId}?`,
    description: 'Query/koneksi yang sedang berjalan akan dihentikan secara paksa.',
    confirmText: 'Kill Process',
    isDestructive: true,
  });

  if (confirm) {
    try {
      await tauriBridge.dbmsKillProcess(props.dbConfig, processId);
      dialogStore.showToast(`Process ${processId} berhasil dihentikan`, 'success', 2000);
      loadProcesslist();
    } catch (err: any) {
      await dialogStore.alert({
        title: 'Gagal Menghentikan Process',
        description: String(err?.message || err),
        variant: 'error',
      });
    }
  }
}
</script>
