<template>
  <div
    v-if="aiStore.isProviderModalOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-100"
    @click.self="aiStore.closeProviderModal"
  >
    <div class="bg-boba-950 border border-boba-800 shadow-2xl rounded-xl w-full max-w-4xl text-[12px] text-slate-200 overflow-hidden flex flex-col font-sans max-h-[90vh]">
      <!-- Modal Header -->
      <div class="px-5 py-3 bg-boba-900 border-b border-boba-800 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="text-base">⚙️</span>
          <span class="font-bold text-slate-100 text-sm">Pengaturan Provider & AI Copilot</span>
        </div>
        <button
          @click="aiStore.closeProviderModal"
          class="text-slate-400 hover:text-white text-base px-2 py-0.5 rounded transition hover:bg-boba-800"
          title="Tutup (Esc)"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body (2 Columns) -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left Column: Providers List & Navigation -->
        <div class="w-64 border-r border-boba-800 bg-boba-900/60 p-3 flex flex-col space-y-2 overflow-y-auto no-scrollbar">
          <div class="flex items-center justify-between pb-1">
            <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Daftar Provider</span>
            <button
              @click="handleNewProvider"
              class="px-2 py-0.5 bg-boba-accent hover:bg-boba-accent-hover text-white rounded text-[10px] font-medium transition flex items-center space-x-1 shadow"
            >
              <span>+ Tambah</span>
            </button>
          </div>

          <!-- Provider Items -->
          <div class="space-y-1.5 flex-1">
            <div
              v-for="p in aiStore.providers"
              :key="p.id"
              @click="selectProvider(p)"
              :class="[
                'p-2.5 rounded-lg border cursor-pointer transition flex flex-col space-y-1 select-none',
                !isGuideActive && selectedId === p.id
                  ? 'bg-boba-accent/15 border-boba-accent text-sky-100 shadow-sm'
                  : 'bg-boba-900 border-boba-800 text-slate-300 hover:border-boba-700 hover:bg-boba-850'
              ]"
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold truncate text-[11px]">{{ p.name }}</span>
                <span
                  v-if="aiStore.activeProviderId === p.id"
                  class="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded text-[9px] font-mono shrink-0"
                >
                  Aktif
                </span>
              </div>
              <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span class="capitalize">{{ p.type }}</span>
                <span class="truncate max-w-[110px]" :title="p.model">{{ p.model || 'No model' }}</span>
              </div>
            </div>
          </div>

          <!-- Bottom: Panduan Penggunaan Button -->
          <div class="pt-2 border-t border-boba-800 mt-auto">
            <button
              @click="openGuide"
              :class="[
                'w-full p-2.5 rounded-lg border text-left transition flex items-center space-x-2.5 select-none',
                isGuideActive
                  ? 'bg-boba-accent/20 border-boba-accent text-sky-200 shadow-sm'
                  : 'bg-boba-900 border-boba-800 text-slate-300 hover:border-boba-700 hover:bg-boba-850'
              ]"
            >
              <span class="text-base shrink-0">📖</span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-[11px] leading-tight text-white">Panduan Penggunaan</div>
                <div class="text-[9.5px] text-slate-400 truncate">Cara setting, tools, & tips</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Right Column: Content Area (Guide or Provider Form) -->
        <div class="flex-1 p-5 overflow-y-auto no-scrollbar space-y-4 bg-boba-950">
          <!-- 1. USER GUIDE VIEW -->
          <div v-if="isGuideActive" class="space-y-4 animate-in fade-in duration-150">
            <div class="border-b border-boba-800 pb-3">
              <h3 class="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>📖</span>
                <span>Panduan Lengkap AI Server Copilot</span>
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Panduan praktis untuk konfigurasi provider AI, pemahaman mode kerja agent server, dan penggunaan fitur secara optimal.
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <!-- Card 1: Konfigurasi Provider -->
              <div class="bg-boba-900 border border-boba-800 rounded-xl p-3.5 space-y-2">
                <div class="flex items-center space-x-2 text-sky-300 font-semibold text-xs border-b border-boba-800 pb-1.5">
                  <span>🔌</span>
                  <span>1. Cara Setting Provider & Tarik Model</span>
                </div>
                <ul class="text-[11px] text-slate-300 space-y-1.5 leading-relaxed list-disc list-inside">
                  <li>
                    <strong class="text-slate-100">Base URL:</strong> Masukkan URL endpoint API Anda. Mendukung OpenAI, Claude, Gemini, Ollama lokal (<code class="bg-boba-950 px-1 py-0.5 rounded text-sky-300 font-mono">http://localhost:11434</code>), dan router OpenAI-compatible.
                  </li>
                  <li>
                    <strong class="text-slate-100">Tarik Daftar Model:</strong> Klik tombol <span class="bg-boba-800 px-1.5 py-0.5 rounded text-sky-300">🔄 Tarik Daftar Model</span> untuk otomatis mendeteksi semua model yang aktif di server provider tanpa perlu ketik manual.
                  </li>
                  <li>
                    <strong class="text-slate-100">Jadikan Default:</strong> Tekan tombol <em>Jadikan Default</em> agar model dipilih saat Anda membuka chat AI.
                  </li>
                </ul>
              </div>

              <!-- Card 2: Mode Eksekusi Agent -->
              <div class="bg-boba-900 border border-boba-800 rounded-xl p-3.5 space-y-2">
                <div class="flex items-center space-x-2 text-amber-300 font-semibold text-xs border-b border-boba-800 pb-1.5">
                  <span>🛡️</span>
                  <span>2. Mode Eksekusi (Confirm vs Auto)</span>
                </div>
                <ul class="text-[11px] text-slate-300 space-y-1.5 leading-relaxed list-disc list-inside">
                  <li>
                    <strong class="text-sky-300">🛡️ Mode Konfirmasi (Confirm):</strong> AI akan merancang perintah, lalu menampilkan kartu konfirmasi di chat. Perintah hanya dijalankan setelah Anda menekan <span class="text-emerald-400 font-medium">✓ Jalankan</span>.
                  </li>
                  <li>
                    <strong class="text-amber-300">⚡ Mode Otomatis (Auto):</strong> AI mengeksekusi instruksi server secara mandiri untuk alur kerja cepat.
                  </li>
                  <li>
                    <strong class="text-rose-400">Guardrail Keamanan:</strong> Perintah berbahaya (<code class="bg-boba-950 px-1 py-0.5 rounded text-rose-300 font-mono">rm -rf /</code>, <code class="bg-boba-950 px-1 py-0.5 rounded text-rose-300 font-mono">mkfs</code>, <code class="bg-boba-950 px-1 py-0.5 rounded text-rose-300 font-mono">reboot</code>, dll) otomatis ditahan untuk konfirmasi manual pada mode apapun.
                  </li>
                </ul>
              </div>

              <!-- Card 3: Kemampuan Tool Server -->
              <div class="bg-boba-900 border border-boba-800 rounded-xl p-3.5 space-y-2">
                <div class="flex items-center space-x-2 text-emerald-300 font-semibold text-xs border-b border-boba-800 pb-1.5">
                  <span>🛠️</span>
                  <span>3. Kemampuan Tool Server Remote</span>
                </div>
                <div class="space-y-1.5 text-[11px] text-slate-300 leading-relaxed font-sans">
                  <div class="bg-boba-950 p-2 rounded border border-boba-800/80 space-y-1">
                    <div class="font-mono text-sky-300 font-semibold text-[10.5px]">exec_command</div>
                    <p class="text-slate-400 text-[10.5px]">Menjalankan perintah bash di server remote via SSH (status service, port, tail log, diagnosa).</p>
                  </div>
                  <div class="bg-boba-950 p-2 rounded border border-boba-800/80 space-y-1">
                    <div class="font-mono text-sky-300 font-semibold text-[10.5px]">read_file & write_file</div>
                    <p class="text-slate-400 text-[10.5px]">Membaca & mengubah file server secara langsung. Setiap penulisan otomatis membuat cadangan <code class="text-amber-300 font-mono">&lt;file&gt;.boba.bak</code> sebelum ditimpa.</p>
                  </div>
                  <div class="bg-boba-950 p-2 rounded border border-boba-800/80 space-y-1">
                    <div class="font-mono text-sky-300 font-semibold text-[10.5px]">get_system_metrics</div>
                    <p class="text-slate-400 text-[10.5px]">Mengambil metrik real-time penggunaan CPU, RAM, Disk, dan Uptime server.</p>
                  </div>
                </div>
              </div>

              <!-- Card 4: Pintasan & Tips Penggunaan -->
              <div class="bg-boba-900 border border-boba-800 rounded-xl p-3.5 space-y-2">
                <div class="flex items-center space-x-2 text-purple-300 font-semibold text-xs border-b border-boba-800 pb-1.5">
                  <span>✨</span>
                  <span>4. Pintasan Konteks & Tips Cepat</span>
                </div>
                <ul class="text-[11px] text-slate-300 space-y-1.5 leading-relaxed list-disc list-inside">
                  <li>
                    <strong class="text-slate-100">Shortcut Global:</strong> Tekan <kbd class="bg-boba-950 border border-boba-700 px-1.5 py-0.5 rounded text-sky-300 font-mono text-[10px]">Ctrl + Shift + A</kbd> kapan saja untuk membuka/menutup panel AI Copilot.
                  </li>
                  <li>
                    <strong class="text-slate-100">Analisis Error Terminal:</strong> Blok teks log error di terminal SSH ➔ Klik kanan ➔ <span class="text-sky-300">✨ Analisis Error dengan AI</span>.
                  </li>
                  <li>
                    <strong class="text-slate-100">Analisis File SFTP:</strong> Klik kanan file log atau file config di SFTP Manager ➔ <span class="text-sky-300">✨ Analisis File dengan AI Copilot</span>.
                  </li>
                  <li>
                    <strong class="text-slate-100">Ubah Ukuran Chat:</strong> Tarik border kiri panel chat untuk memperlebar atau tekan tombol <kbd class="bg-boba-950 px-1 rounded font-mono">⤢</kbd> di header.
                  </li>
                </ul>
              </div>
            </div>

            <div class="pt-2 flex justify-end">
              <button
                type="button"
                @click="handleNewProvider"
                class="px-4 py-2 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-lg text-xs font-semibold transition shadow"
              >
                + Konfigurasi Provider Baru Sekarang
              </button>
            </div>
          </div>

          <!-- 2. PROVIDER FORM VIEW -->
          <div v-else-if="form" class="space-y-3.5 animate-in fade-in duration-150">
            <!-- Helper Banner with Link to Guide -->
            <div class="p-2.5 rounded-lg bg-boba-900 border border-boba-800 flex items-center justify-between text-[11px]">
              <div class="flex items-center space-x-2 text-slate-300">
                <span>💡</span>
                <span>Butuh bantuan setting provider atau penjelasan mode eksekusi?</span>
              </div>
              <button
                type="button"
                @click="openGuide"
                class="text-boba-accent hover:underline font-semibold flex items-center space-x-1"
              >
                <span>Baca Panduan</span>
                <span>➔</span>
              </button>
            </div>

            <!-- Provider Type -->
            <div>
              <label class="block text-[11px] font-semibold text-slate-300 mb-1">Tipe Provider</label>
              <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <button
                  v-for="t in providerTypes"
                  :key="t.value"
                  type="button"
                  @click="changeType(t.value as any)"
                  :class="[
                    'py-1.5 px-2 rounded border text-[11px] font-medium transition text-center',
                    form.type === t.value
                      ? 'bg-boba-accent text-white border-boba-accent shadow'
                      : 'bg-boba-900 border-boba-800 text-slate-300 hover:bg-boba-850 hover:border-boba-700'
                  ]"
                >
                  {{ t.label }}
                </button>
              </div>
            </div>

            <!-- Profile Name -->
            <div>
              <label class="block text-[11px] font-semibold text-slate-300 mb-1">Nama Profil</label>
              <input
                v-model="form.name"
                type="text"
                placeholder="Misal: OpenAI GPT-4o, DeepSeek Prod, Ollama Lokal"
                class="w-full bg-boba-900 border border-boba-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-sans transition"
              />
            </div>

            <!-- Base URL -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-[11px] font-semibold text-slate-300">Base URL Endpoint</label>
                <span class="text-[10px] text-slate-500 font-mono">Contoh: https://router.hariansaku.id/v1</span>
              </div>
              <input
                v-model="form.baseUrl"
                type="text"
                placeholder="https://api.openai.com/v1"
                class="w-full bg-boba-900 border border-boba-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-mono transition"
              />
            </div>

            <!-- API Key -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-[11px] font-semibold text-slate-300">API Key</label>
                <button
                  type="button"
                  @click="showKey = !showKey"
                  class="text-[10px] text-sky-400 hover:text-sky-300 transition"
                >
                  {{ showKey ? 'Sembunyikan' : 'Perlihatkan' }}
                </button>
              </div>
              <input
                v-model="form.apiKey"
                :type="showKey ? 'text' : 'password'"
                :placeholder="form.type === 'ollama' ? 'Opsional untuk Ollama' : 'sk-...'"
                class="w-full bg-boba-900 border border-boba-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-mono transition"
              />
            </div>

            <!-- Model Name with Dynamic Fetch Button -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-[11px] font-semibold text-slate-300">Nama Model (Model ID)</label>
                <!-- Tombol Tarik Model Dinamis -->
                <button
                  type="button"
                  @click="handleFetchModels"
                  :disabled="isFetchingModels"
                  class="text-[10px] px-2.5 py-1 rounded bg-boba-850 border border-boba-700 text-sky-300 hover:text-white hover:border-boba-accent hover:bg-boba-800 transition flex items-center space-x-1.5 disabled:opacity-50 shadow-sm"
                  title="Ambil daftar model yang tersedia langsung dari Base URL provider"
                >
                  <span>{{ isFetchingModels ? '⏳' : '🔄' }}</span>
                  <span>{{ isFetchingModels ? 'Menarik Model...' : 'Tarik Daftar Model' }}</span>
                </button>
              </div>

              <!-- Dropdown jika model sudah ditarik -->
              <div v-if="availableModels.length > 0" class="mb-2">
                <select
                  v-model="form.model"
                  class="w-full bg-boba-900 border border-boba-700 text-sky-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-mono cursor-pointer transition"
                >
                  <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>

              <!-- Input text biasa untuk custom model -->
              <input
                v-model="form.model"
                type="text"
                placeholder="gpt-4o, claude-3-7-sonnet-20250219, ag/gemini-3.8-flash..."
                class="w-full bg-boba-900 border border-boba-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-mono transition"
              />
            </div>

            <!-- Action Buttons -->
            <div class="pt-4 border-t border-boba-800 flex items-center justify-between">
              <button
                v-if="form.id && aiStore.providers.some(p => p.id === form.id)"
                type="button"
                @click="handleDelete"
                class="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 hover:text-rose-100 rounded-lg text-xs transition"
              >
                Hapus Provider
              </button>
              <div v-else></div>

              <div class="flex items-center space-x-2">
                <button
                  type="button"
                  @click="handleSetDefault"
                  class="px-3.5 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs transition font-medium"
                >
                  Jadikan Default
                </button>
                <button
                  type="button"
                  @click="handleSave"
                  class="px-4 py-1.5 bg-boba-accent hover:bg-boba-accent-hover text-white font-semibold rounded-lg text-xs transition shadow-md"
                >
                  Simpan
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
import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { AiProviderConfig, AiProviderType } from '../types/index.js';
import { useAiAgentStore } from '../stores/aiAgentStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import { fetchAvailableModels } from '../services/aiAdapters.js';

const aiStore = useAiAgentStore();
const dialogStore = useDialogStore();

const providerTypes = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'custom', label: 'Custom / OpenRouter' },
];

const selectedId = ref<string>('');
const isGuideActive = ref(false);
const showKey = ref(false);
const isFetchingModels = ref(false);
const availableModels = ref<string[]>([]);

const form = ref<AiProviderConfig>({
  id: '',
  name: '',
  type: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  availableModels: [],
});

function openGuide() {
  isGuideActive.value = true;
  selectedId.value = '';
}

function changeType(type: AiProviderType) {
  form.value.type = type;
  availableModels.value = [];
  if (type === 'openai') {
    form.value.baseUrl = 'https://api.openai.com/v1';
    form.value.model = 'gpt-4o';
  } else if (type === 'anthropic') {
    form.value.baseUrl = 'https://api.anthropic.com';
    form.value.model = 'claude-3-7-sonnet-20250219';
  } else if (type === 'gemini') {
    form.value.baseUrl = 'https://generativelanguage.googleapis.com';
    form.value.model = 'gemini-2.5-flash';
  } else if (type === 'ollama') {
    form.value.baseUrl = 'http://localhost:11434';
    form.value.model = 'qwen2.5-coder:7b';
  } else {
    form.value.baseUrl = 'https://api.deepseek.com/v1';
    form.value.model = 'deepseek-chat';
  }
}

function selectProvider(p: AiProviderConfig) {
  isGuideActive.value = false;
  selectedId.value = p.id;
  form.value = { ...p };
  availableModels.value = p.availableModels || [];
}

function handleNewProvider() {
  isGuideActive.value = false;
  const id = `provider_${Date.now()}`;
  selectedId.value = id;
  form.value = {
    id,
    name: 'Provider Baru',
    type: 'custom',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    availableModels: [],
  };
  availableModels.value = [];
}

async function handleFetchModels() {
  isFetchingModels.value = true;
  try {
    const list = await fetchAvailableModels(form.value);
    if (list && list.length > 0) {
      availableModels.value = list;
      form.value.availableModels = list;
      if (!list.includes(form.value.model)) {
        form.value.model = list[0];
      }
      dialogStore.showToast(`Berhasil menemukan ${list.length} model!`, 'success', 2500);
    } else {
      dialogStore.showToast('Tidak ada model yang ditemukan pada endpoint tersebut', 'info', 2500);
    }
  } catch (err: any) {
    dialogStore.alert({
      title: 'Gagal Menarik Model',
      description: `Pastikan Base URL dan API Key benar.\nDetail: ${err.message || String(err)}`,
      variant: 'error',
    });
  } finally {
    isFetchingModels.value = false;
  }
}

function handleSave() {
  if (!form.value.name.trim()) {
    form.value.name = `${form.value.type} profile`;
  }
  form.value.availableModels = availableModels.value;
  aiStore.saveProvider(form.value);
  dialogStore.showToast('Provider AI berhasil disimpan', 'success', 1500);
}

function handleSetDefault() {
  handleSave();
  aiStore.setActiveProvider(form.value.id);
  dialogStore.showToast(`Provider aktif: ${form.value.name}`, 'success', 1500);
}

async function handleDelete() {
  const isConfirmed = await dialogStore.confirm({
    title: 'Hapus Provider AI',
    description: `Apakah Anda yakin ingin menghapus provider "${form.value.name}"?`,
    confirmText: 'Hapus',
    cancelText: 'Batal',
    isDestructive: true,
  });
  if (isConfirmed) {
    aiStore.deleteProvider(form.value.id);
    if (aiStore.providers.length > 0) {
      selectProvider(aiStore.providers[0]);
    } else {
      handleNewProvider();
    }
  }
}

watch(
  () => aiStore.isProviderModalOpen,
  isOpen => {
    if (isOpen) {
      isGuideActive.value = false;
      const active = aiStore.activeProvider;
      if (active) {
        selectProvider(active);
      } else if (aiStore.providers.length > 0) {
        selectProvider(aiStore.providers[0]);
      } else {
        handleNewProvider();
      }
    }
  }
);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && aiStore.isProviderModalOpen) {
    aiStore.closeProviderModal();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>
