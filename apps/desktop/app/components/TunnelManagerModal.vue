<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
    @click.self="close"
  >
    <div class="bg-[#12151e] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-4xl h-[75vh] flex flex-col overflow-hidden text-slate-200 select-none">
      <!-- Header -->
      <div class="h-14 border-b border-[#23293a] px-5 flex items-center justify-between bg-[#161a26] shrink-0">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Icon icon="lucide:network" class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="font-bold text-sm tracking-wide text-white">SSH Tunnel Manager</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                {{ hostTitle }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Kelola local port forwarding untuk layanan remote ke localhost.</p>
          </div>
        </div>

        <div class="flex items-center space-x-2.5">
          <!-- Refresh Button -->
          <button
            @click="loadTunnels"
            :disabled="isRefreshing"
            class="p-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition disabled:opacity-50"
            title="Muat Ulang Status Tunnel"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-4 h-4', isRefreshing ? 'animate-spin text-emerald-400' : '']" />
          </button>

          <!-- Close Button -->
          <button
            @click="close"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#23293a] transition"
          >
            <Icon icon="lucide:x" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Sidebar / New Tunnel Form -->
        <div class="w-[340px] border-r border-[#262c3d] bg-[#161a26]/50 p-5 overflow-y-auto flex flex-col shrink-0">
          <h3 class="font-bold text-slate-200 text-sm mb-4 flex items-center space-x-2">
            <Icon icon="lucide:plus-circle" class="w-4 h-4 text-emerald-400" />
            <span>Tambah Tunnel Baru</span>
          </h3>

          <div class="space-y-4 text-sm">
            <div>
              <label class="block text-xs text-slate-400 mb-1.5">Preset Layanan</label>
              <select
                v-model="selectedPreset"
                @change="applyPreset"
                class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
              >
                <option v-for="p in presets" :key="p.label" :value="p">{{ p.label }}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs text-slate-400 mb-1.5">Nama Koneksi</label>
              <input
                v-model="newTunnel.name"
                type="text"
                placeholder="misal: PostgreSQL Dev"
                class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>

            <div class="pt-3 border-t border-[#262c3d]">
              <div class="text-xs font-semibold text-emerald-400 mb-2.5 flex items-center space-x-1.5">
                <Icon icon="lucide:laptop" class="w-3.5 h-3.5" />
                <span>Mesin Lokal (Local)</span>
              </div>
              <div class="grid grid-cols-5 gap-2">
                <div class="col-span-3">
                  <label class="block text-[10px] text-slate-500 mb-1">Host (Bind)</label>
                  <input
                    v-model="newTunnel.localHost"
                    type="text"
                    class="w-full bg-[#12151e] border border-[#2e374d] rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 text-xs font-mono"
                  />
                </div>
                <div class="col-span-2">
                  <label class="block text-[10px] text-slate-500 mb-1">Port</label>
                  <input
                    v-model.number="newTunnel.localPort"
                    type="number"
                    class="w-full bg-[#12151e] border border-[#2e374d] rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div class="pt-3 border-t border-[#262c3d]">
              <div class="text-xs font-semibold text-violet-400 mb-2.5 flex items-center space-x-1.5">
                <Icon icon="lucide:server" class="w-3.5 h-3.5" />
                <span>Server Remote (Target)</span>
              </div>
              <div class="grid grid-cols-5 gap-2">
                <div class="col-span-3">
                  <label class="block text-[10px] text-slate-500 mb-1">Host</label>
                  <input
                    v-model="newTunnel.remoteHost"
                    type="text"
                    class="w-full bg-[#12151e] border border-[#2e374d] rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 text-xs font-mono"
                  />
                </div>
                <div class="col-span-2">
                  <label class="block text-[10px] text-slate-500 mb-1">Port</label>
                  <input
                    v-model.number="newTunnel.remotePort"
                    type="number"
                    class="w-full bg-[#12151e] border border-[#2e374d] rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <button
              @click="addTunnel"
              :disabled="!isFormValid"
              class="w-full mt-5 px-4 py-2.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <Icon icon="lucide:save" class="w-4 h-4" />
              <span>Simpan Konfigurasi</span>
            </button>
          </div>
        </div>

        <!-- Main Content / Tunnel List -->
        <div class="flex-1 bg-[#12151e] p-5 overflow-y-auto">
          <!-- Empty State -->
          <div v-if="tunnels.length === 0" class="h-full flex flex-col items-center justify-center text-slate-500">
            <div class="w-16 h-16 bg-[#161a26] border border-[#2e374d] rounded-2xl flex items-center justify-center mb-4">
              <Icon icon="lucide:network" class="w-8 h-8 opacity-50 text-slate-400" />
            </div>
            <p class="text-sm font-medium text-slate-300 mb-1">Belum ada Tunnel Tersimpan</p>
            <p class="text-xs max-w-xs text-center leading-relaxed">
              Tambahkan konfigurasi port forwarding di panel sebelah kiri untuk mengakses layanan remote melalui mesin lokal Anda.
            </p>
          </div>

          <!-- Tunnel List -->
          <div v-else class="space-y-3">
            <div
              v-for="t in tunnels"
              :key="t.id"
              class="p-4 border rounded-xl flex items-center justify-between transition-colors bg-[#161a26] border-[#262c3d] hover:border-[#3a445e]"
            >
              <div class="flex items-center space-x-4">
                <!-- Status Icon -->
                <div
                  class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                  :class="t.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#1e2333] text-slate-500'"
                >
                  <Icon icon="lucide:arrow-right-left" class="w-5 h-5" />
                </div>

                <!-- Info -->
                <div>
                  <div class="flex items-center space-x-2">
                    <h4 class="font-bold text-sm text-slate-200">{{ t.name }}</h4>
                    <span
                      :class="t.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'"
                      class="text-[10px] px-2 py-0.5 rounded-full border flex items-center space-x-1.5 font-medium"
                    >
                      <span v-if="t.is_active" class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span v-else class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                      <span>{{ t.is_active ? 'Aktif' : 'Berhenti' }}</span>
                    </span>
                  </div>
                  <div class="text-xs text-slate-400 mt-1 font-mono flex items-center space-x-2">
                    <span>{{ t.localHost }}:{{ t.localPort }}</span>
                    <Icon icon="lucide:arrow-right" class="w-3 h-3 text-slate-500" />
                    <span>{{ t.remoteHost }}:{{ t.remotePort }}</span>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center space-x-2">
                <button
                  @click="toggleTunnel(t)"
                  :disabled="t.loading"
                  :class="t.is_active ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30'"
                  class="px-3 py-1.5 rounded-lg border text-xs font-medium transition flex items-center space-x-1.5 w-24 justify-center"
                >
                  <Icon v-if="t.loading" icon="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
                  <template v-else>
                    <Icon :icon="t.is_active ? 'lucide:square' : 'lucide:play'" class="w-3 h-3" />
                    <span>{{ t.is_active ? 'Stop' : 'Start' }}</span>
                  </template>
                </button>

                <button
                  @click="copyConnection(t)"
                  class="p-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition"
                  title="Salin Koneksi Lokal (Host:Port)"
                >
                  <Icon icon="lucide:copy" class="w-4 h-4" />
                </button>

                <button
                  @click="removeTunnel(t)"
                  :disabled="t.loading"
                  class="p-1.5 bg-[#1e2333] hover:bg-rose-500/20 border border-[#2e374d] hover:border-rose-500/30 hover:text-rose-400 text-slate-400 rounded-lg transition disabled:opacity-50"
                  title="Hapus Konfigurasi"
                >
                  <Icon icon="lucide:trash-2" class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge.js';
import { useDialogStore } from '../stores/dialogStore.js';
import type { TunnelConfig, ActiveTunnelInfo } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
  sessionId: string;
  hostTitle: string;
}>();

const emit = defineEmits(['close']);
const dialogStore = useDialogStore();

interface UITunnelConfig extends TunnelConfig {
  is_active: boolean;
  loading: boolean;
}

const tunnels = ref<UITunnelConfig[]>([]);
const isRefreshing = ref(false);

const storageKey = computed(() => `boba_tunnels_${props.sessionId}`);

// Presets
const presets = [
  { label: 'Custom', name: '', localPort: '', remoteHost: '127.0.0.1', remotePort: '' },
  { label: 'PostgreSQL', name: 'PostgreSQL', localPort: 5432, remoteHost: '127.0.0.1', remotePort: 5432 },
  { label: 'MySQL / MariaDB', name: 'MySQL / MariaDB', localPort: 3306, remoteHost: '127.0.0.1', remotePort: 3306 },
  { label: 'Redis Cache', name: 'Redis Cache', localPort: 6379, remoteHost: '127.0.0.1', remotePort: 6379 },
  { label: 'MongoDB', name: 'MongoDB', localPort: 27017, remoteHost: '127.0.0.1', remotePort: 27017 },
  { label: 'Web HTTP', name: 'Web HTTP', localPort: 8080, remoteHost: '127.0.0.1', remotePort: 80 },
  { label: 'Web HTTPS', name: 'Web HTTPS', localPort: 8443, remoteHost: '127.0.0.1', remotePort: 443 },
];

const selectedPreset = ref(presets[0]);
const newTunnel = ref({
  name: '',
  localHost: '127.0.0.1',
  localPort: '' as number | '',
  remoteHost: '127.0.0.1',
  remotePort: '' as number | ''
});

const applyPreset = () => {
  const p = selectedPreset.value;
  if (p && p.label !== 'Custom') {
    newTunnel.value.name = p.name;
    newTunnel.value.localPort = p.localPort as number | '';
    newTunnel.value.remoteHost = p.remoteHost;
    newTunnel.value.remotePort = p.remotePort as number | '';
  }
};

const isFormValid = computed(() => {
  return newTunnel.value.name.trim() !== '' &&
         newTunnel.value.localHost.trim() !== '' &&
         newTunnel.value.localPort !== '' &&
         newTunnel.value.remoteHost.trim() !== '' &&
         newTunnel.value.remotePort !== '';
});

// Logic
const loadTunnels = async () => {
  if (!props.sessionId) return;
  
  isRefreshing.value = true;
  try {
    const raw = localStorage.getItem(storageKey.value);
    let stored: TunnelConfig[] = [];
    if (raw) {
      try { stored = JSON.parse(raw); } catch (e) {}
    }

    let activeList: ActiveTunnelInfo[] = [];
    try {
      activeList = await tauriBridge.sshListActiveTunnels(props.sessionId);
    } catch (e) {
      console.error("Gagal mengambil active tunnels:", e);
    }

    tunnels.value = stored.map(t => ({
      ...t,
      is_active: activeList.some(a => a.tunnel_id === t.id && a.is_active),
      loading: false
    }));
  } finally {
    isRefreshing.value = false;
  }
};

const saveTunnelsToStorage = () => {
  const toSave: TunnelConfig[] = tunnels.value.map(t => ({
    id: t.id,
    sessionId: t.sessionId,
    name: t.name,
    localHost: t.localHost,
    localPort: t.localPort,
    remoteHost: t.remoteHost,
    remotePort: t.remotePort,
    autoStart: t.autoStart
  }));
  localStorage.setItem(storageKey.value, JSON.stringify(toSave));
};

const addTunnel = () => {
  if (!isFormValid.value) return;
  
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10);
  
  const nt: UITunnelConfig = {
    id,
    sessionId: props.sessionId,
    name: newTunnel.value.name,
    localHost: newTunnel.value.localHost,
    localPort: Number(newTunnel.value.localPort),
    remoteHost: newTunnel.value.remoteHost,
    remotePort: Number(newTunnel.value.remotePort),
    is_active: false,
    loading: false
  };
  
  tunnels.value.push(nt);
  saveTunnelsToStorage();
  
  // Reset form
  selectedPreset.value = presets[0];
  newTunnel.value = {
    name: '',
    localHost: '127.0.0.1',
    localPort: '',
    remoteHost: '127.0.0.1',
    remotePort: ''
  };
};

const toggleTunnel = async (t: UITunnelConfig) => {
  t.loading = true;
  try {
    if (t.is_active) {
      await tauriBridge.sshStopTunnel(t.id);
      t.is_active = false;
      dialogStore.showToast(`Tunnel ${t.name} dihentikan`, 'success');
    } else {
      await tauriBridge.sshStartTunnel(
        props.sessionId,
        t.id,
        t.name,
        t.localHost,
        t.localPort,
        t.remoteHost,
        t.remotePort
      );
      t.is_active = true;
      dialogStore.showToast(`Tunnel ${t.name} berhasil dijalankan`, 'success');
    }
  } catch (err: any) {
    dialogStore.showToast(`Gagal: ${err.message || err}`, 'error');
  } finally {
    t.loading = false;
  }
};

const removeTunnel = async (t: UITunnelConfig) => {
  if (t.loading) return;
  
  if (t.is_active) {
    t.loading = true;
    try {
      await tauriBridge.sshStopTunnel(t.id);
    } catch (err: any) {
      console.warn("Error stopping tunnel before remove", err);
    }
  }
  
  tunnels.value = tunnels.value.filter(x => x.id !== t.id);
  saveTunnelsToStorage();
};

const copyConnection = async (t: UITunnelConfig) => {
  const conn = `${t.localHost}:${t.localPort}`;
  try {
    await navigator.clipboard.writeText(conn);
    dialogStore.showToast(`Dicopy: ${conn}`, 'success');
  } catch (err) {
    dialogStore.showToast('Gagal menyalin teks', 'error');
  }
};

const close = () => {
  emit('close');
};

// Lifecycle
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    loadTunnels();
  }
});

onMounted(() => {
  if (props.isOpen) {
    loadTunnels();
  }
});
</script>
