<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] px-4 select-none" @click.self="close">
        <div class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm -z-10" @click="close"></div>
        <div
          role="dialog"
          aria-modal="true"
          class="bg-boba-900 w-full max-w-2xl rounded-xl border border-boba-700 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        >
          <div class="flex items-center px-4 py-3.5 border-b border-boba-800 bg-boba-950/60">
            <Icon icon="lucide:search" class="w-4 h-4 text-slate-400 mr-3 shrink-0" />
            <input
              ref="searchInput"
              v-model="query"
              class="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder-slate-500 text-sm font-sans"
              placeholder="Cari sesi SSH, database, aksi, atau split layar... (↑↓ navigasi, Enter pilih, Esc tutup)"
              @keydown.down.prevent="moveDown"
              @keydown.up.prevent="moveUp"
              @keydown.enter.prevent="executeSelected"
              @keydown.esc="close"
            />
            <kbd class="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-boba-850 border border-boba-700 rounded">Esc</kbd>
          </div>

          <div class="max-h-[55vh] overflow-y-auto p-2" ref="scrollContainer">
            <div v-if="filteredItems.length === 0" class="p-8 text-center text-slate-500 text-xs">
              Tidak ada sesi atau perintah yang cocok dengan "{{ query }}".
            </div>
            <div
              v-for="(item, index) in filteredItems"
              :key="item.id"
              class="flex items-center px-3 py-2 rounded-lg cursor-pointer mb-1 transition-colors border-l-2"
              :class="index === selectedIndex ? 'bg-sky-500/20 text-sky-200 border-sky-400' : 'border-transparent text-slate-300 hover:bg-boba-800/60'"
              @click="executeItem(item)"
              @mouseenter="selectedIndex = index"
            >
              <div class="mr-3 shrink-0 flex items-center justify-center w-6 h-6 rounded bg-boba-950/80 border border-boba-800">
                <Icon :icon="item.icon" class="w-3.5 h-3.5" :class="item.iconColor" />
              </div>
              <div class="flex-1 flex flex-col overflow-hidden min-w-0">
                <span class="font-medium text-xs truncate" :class="index === selectedIndex ? 'text-sky-100' : 'text-slate-200'">{{ item.title }}</span>
                <span v-if="item.subtitle" class="text-[10px] text-slate-500 truncate" :class="{ 'text-sky-300/70': index === selectedIndex }">{{ item.subtitle }}</span>
              </div>
              <div class="ml-3 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-boba-800/80 text-slate-400 uppercase shrink-0 border border-boba-700/60">
                {{ item.type }}
              </div>
            </div>
          </div>

          <div class="px-4 py-2 border-t border-boba-800/80 bg-boba-950/40 text-[10px] text-slate-500 flex items-center justify-between font-mono">
            <span>{{ filteredItems.length }} item tersedia</span>
            <span>Tekan <kbd class="text-slate-400">Ctrl+K</kbd> kapan saja</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { Icon } from '@iconify/vue';
import { useVaultStore } from '../stores/vaultStore.js';
import { useSessionStore } from '../stores/sessionStore.js';
import { useAiAgentStore } from '../stores/aiAgentStore.js';

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  iconColor: string;
  type: string;
  action: () => void;
}

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits([
  'close',
  'new-session',
  'new-db',
  'lock-vault',
  'open-sync',
  'open-shortcuts',
  'open-update',
  'open-autolock',
]);

const vaultStore = useVaultStore();
const sessionStore = useSessionStore();
const aiAgentStore = useAiAgentStore();

const query = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);
const selectedIndex = ref(0);

const close = () => {
  emit('close');
  query.value = '';
};

watch(() => props.isOpen, async (val) => {
  if (val) {
    query.value = '';
    selectedIndex.value = 0;
    await nextTick();
    searchInput.value?.focus();
  }
});

const actions: PaletteItem[] = [
  { id: 'act-1', title: '+ Buat Sesi SSH Baru', subtitle: 'Konfigurasi host, user, dan port SSH', icon: 'lucide:plus-circle', iconColor: 'text-sky-400', type: 'aksi', action: () => emit('new-session') },
  { id: 'act-2', title: '+ Tambah Koneksi Database', subtitle: 'MySQL, PostgreSQL, SQLite, Redis, MongoDB', icon: 'lucide:database', iconColor: 'text-emerald-400', type: 'aksi', action: () => emit('new-db') },
  { id: 'act-3', title: '✨ Buka AI Server Copilot', subtitle: 'Diagnosa, runbook, dan auto-fix terminal', icon: 'lucide:sparkles', iconColor: 'text-purple-400', type: 'aksi', action: () => aiAgentStore.toggleDrawer() },
  { id: 'act-4', title: '🔒 Kunci Proteksi Data (Ctrl+Shift+L)', subtitle: 'Kunci seluruh data sesi dan private keys', icon: 'lucide:lock', iconColor: 'text-rose-400', type: 'aksi', action: () => emit('lock-vault') },
  { id: 'act-5', title: '⏱️ Pengaturan Kunci Otomatis (Auto-Lock)', subtitle: 'Atur durasi idle sebelum proteksi terkunci', icon: 'lucide:timer', iconColor: 'text-amber-400', type: 'aksi', action: () => emit('open-autolock') },
  { id: 'act-6', title: '☁️ Sinkronisasi Cloud', subtitle: 'Sinkronisasi E2EE antar perangkat', icon: 'lucide:cloud', iconColor: 'text-sky-400', type: 'aksi', action: () => emit('open-sync') },
  { id: 'act-7', title: '⌨️ Pintasan Keyboard (Ctrl+/)', subtitle: 'Lihat daftar lengkap shortcut aplikasi', icon: 'lucide:keyboard', iconColor: 'text-slate-300', type: 'aksi', action: () => emit('open-shortcuts') },
  { id: 'act-8', title: '🔄 Cek Pembaruan Aplikasi', subtitle: 'Periksa update in-app versi terbaru', icon: 'lucide:refresh-cw', iconColor: 'text-emerald-400', type: 'aksi', action: () => emit('open-update') },
  { id: 'act-9', title: '❚❚ Bagi Layar 2 Kolom (Side by Side)', subtitle: 'Tampilkan 2 terminal berdampingan', icon: 'lucide:columns-2', iconColor: 'text-sky-400', type: 'tata letak', action: () => sessionStore.setLayoutMode('2-col') },
  { id: 'act-10', title: '2☰ Bagi Layar 2 Baris (Top & Bottom)', subtitle: 'Tampilkan 2 terminal atas & bawah', icon: 'lucide:rows-2', iconColor: 'text-sky-400', type: 'tata letak', action: () => sessionStore.setLayoutMode('2-row') },
  { id: 'act-11', title: '⊞ Bagi Layar 4 Kuadran (2x2)', subtitle: 'Tampilkan 4 terminal sekaligus', icon: 'lucide:grid-2x2', iconColor: 'text-sky-400', type: 'tata letak', action: () => sessionStore.setLayoutMode('4') },
  { id: 'act-12', title: '1 Layar Penuh (Tunggal)', subtitle: 'Kembali ke mode tampilan 1 tab per layar', icon: 'lucide:square', iconColor: 'text-slate-400', type: 'tata letak', action: () => sessionStore.setLayoutMode('1') },
];

const allItems = computed<PaletteItem[]>(() => {
  const sessions: PaletteItem[] = (vaultStore.vault?.sessions || []).map(s => ({
    id: `ssh-${s.id}`,
    title: s.name || s.host,
    subtitle: `${s.username}@${s.host}:${s.port}`,
    icon: 'lucide:terminal',
    iconColor: 'text-emerald-400',
    type: 'ssh',
    action: () => sessionStore.openSession(s)
  }));

  const dbs: PaletteItem[] = (vaultStore.vault?.databases || []).map(d => ({
    id: `db-${d.id}`,
    title: d.name,
    subtitle: `${d.engine?.toUpperCase() || 'DB'} • ${d.host}:${d.port || 3306}`,
    icon: 'lucide:database',
    iconColor: 'text-amber-400',
    type: 'db',
    action: () => sessionStore.openDbmsTab(d)
  }));

  return [...sessions, ...dbs, ...actions];
});

const filteredItems = computed(() => {
  if (!query.value.trim()) return allItems.value;
  const q = query.value.toLowerCase();
  return allItems.value.filter(i =>
    i.title.toLowerCase().includes(q) ||
    (i.subtitle && i.subtitle.toLowerCase().includes(q)) ||
    i.type.toLowerCase().includes(q)
  );
});

watch(query, () => { selectedIndex.value = 0; });

const executeItem = (item: PaletteItem) => {
  item.action();
  close();
};

const executeSelected = () => {
  const item = filteredItems.value[selectedIndex.value];
  if (item) executeItem(item);
};

const scrollToSelected = () => {
  nextTick(() => {
    if (!scrollContainer.value) return;
    const el = scrollContainer.value.children[selectedIndex.value] as HTMLElement;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const containerRect = scrollContainer.value.getBoundingClientRect();

    if (rect.bottom > containerRect.bottom) el.scrollIntoView({ block: 'end' });
    else if (rect.top < containerRect.top) el.scrollIntoView({ block: 'start' });
  });
};

const moveDown = () => {
  if (selectedIndex.value < filteredItems.value.length - 1) {
    selectedIndex.value++;
    scrollToSelected();
  }
};

const moveUp = () => {
  if (selectedIndex.value > 0) {
    selectedIndex.value--;
    scrollToSelected();
  }
};
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
