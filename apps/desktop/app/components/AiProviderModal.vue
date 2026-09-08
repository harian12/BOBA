<template>
  <div
    v-if="aiStore.isProviderModalOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-100"
    @click.self="aiStore.closeProviderModal"
  >
    <div class="bg-[#121520] border border-[#262f44] shadow-2xl rounded-xl w-full max-w-3xl text-[12px] text-slate-200 overflow-hidden flex flex-col font-sans max-h-[90vh]">
      <!-- Modal Header -->
      <div class="px-5 py-3 bg-[#0d101a] border-b border-[#21293a] flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="text-base">⚙️</span>
          <span class="font-bold text-slate-100 text-sm">Pengaturan Provider AI</span>
        </div>
        <button
          @click="aiStore.closeProviderModal"
          class="text-slate-400 hover:text-white text-base px-2 py-0.5 rounded transition hover:bg-slate-800/50"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body (2 Columns) -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left Column: Providers List -->
        <div class="w-64 border-r border-[#21293a] bg-[#0a0d16] p-3 flex flex-col space-y-2 overflow-y-auto no-scrollbar">
          <div class="flex items-center justify-between pb-1">
            <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Daftar Provider</span>
            <button
              @click="handleNewProvider"
              class="px-2 py-0.5 bg-purple-600/80 hover:bg-purple-600 text-white rounded text-[10px] font-medium transition flex items-center space-x-1 shadow"
            >
              <span>+ Tambah</span>
            </button>
          </div>

          <div
            v-for="p in aiStore.providers"
            :key="p.id"
            @click="selectProvider(p)"
            :class="[
              'p-2.5 rounded-lg border cursor-pointer transition flex flex-col space-y-1 select-none',
              selectedId === p.id
                ? 'bg-purple-950/40 border-purple-500/60 text-purple-100'
                : 'bg-[#121622] border-[#21283a] text-slate-300 hover:border-slate-600'
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

        <!-- Right Column: Provider Form -->
        <div class="flex-1 p-5 overflow-y-auto no-scrollbar space-y-4 bg-[#121520]">
          <div v-if="form" class="space-y-3.5">
            <!-- Provider Type -->
            <div>
              <label class="block text-[11px] font-semibold text-slate-300 mb-1">Tipe Provider</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="t in providerTypes"
                  :key="t.value"
                  type="button"
                  @click="changeType(t.value as any)"
                  :class="[
                    'py-1.5 px-2 rounded border text-[11px] font-medium transition text-center',
                    form.type === t.value
                      ? 'bg-purple-600 text-white border-purple-500 shadow'
                      : 'bg-[#161b28] border-[#2b354d] text-slate-300 hover:bg-[#1e2538]'
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
                placeholder="Misal: OpenAI GPT-4o, DeepSeek Prod"
                class="w-full bg-[#090c14] border border-[#2b354e] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500 font-sans"
              />
            </div>

            <!-- Base URL -->
            <div>
              <label class="block text-[11px] font-semibold text-slate-300 mb-1">Base URL Endpoint</label>
              <input
                v-model="form.baseUrl"
                type="text"
                placeholder="https://api.openai.com/v1"
                class="w-full bg-[#090c14] border border-[#2b354e] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            <!-- API Key -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-[11px] font-semibold text-slate-300">API Key</label>
                <button
                  type="button"
                  @click="showKey = !showKey"
                  class="text-[10px] text-purple-400 hover:text-purple-300"
                >
                  {{ showKey ? 'Sembunyikan' : 'Perlihatkan' }}
                </button>
              </div>
              <input
                v-model="form.apiKey"
                :type="showKey ? 'text' : 'password'"
                :placeholder="form.type === 'ollama' ? 'Opsional untuk Ollama' : 'sk-...'"
                class="w-full bg-[#090c14] border border-[#2b354e] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
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
                  class="text-[10px] px-2 py-0.5 rounded bg-purple-950 border border-purple-800/80 text-purple-300 hover:text-white hover:bg-purple-900 transition flex items-center space-x-1 disabled:opacity-50"
                  title="Ambil daftar model yang tersedia langsung dari Base URL provider"
                >
                  <span>{{ isFetchingModels ? '⏳' : '🔄' }}</span>
                  <span>{{ isFetchingModels ? 'Menarik...' : 'Tarik Daftar Model' }}</span>
                </button>
              </div>

              <!-- Dropdown jika model sudah ditarik -->
              <div v-if="availableModels.length > 0" class="mb-2">
                <select
                  v-model="form.model"
                  class="w-full bg-[#090c14] border border-purple-800/80 rounded px-2.5 py-1.5 text-xs text-purple-200 focus:outline-none focus:border-purple-500 font-mono cursor-pointer"
                >
                  <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>

              <!-- Input text biasa untuk custom model -->
              <input
                v-model="form.model"
                type="text"
                placeholder="gpt-4o, claude-3-7-sonnet-20250219, qwen2.5-coder:7b..."
                class="w-full bg-[#090c14] border border-[#2b354e] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            <!-- Action Buttons -->
            <div class="pt-4 border-t border-[#21293a] flex items-center justify-between">
              <button
                v-if="form.id && aiStore.providers.some(p => p.id === form.id)"
                type="button"
                @click="handleDelete"
                class="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 hover:text-rose-100 rounded text-xs transition"
              >
                Hapus Provider
              </button>
              <div v-else></div>

              <div class="flex items-center space-x-2">
                <button
                  type="button"
                  @click="handleSetDefault"
                  class="px-3 py-1.5 bg-[#1a2132] hover:bg-[#252f47] text-slate-200 rounded text-xs transition font-medium"
                >
                  Jadikan Default
                </button>
                <button
                  type="button"
                  @click="handleSave"
                  class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded text-xs transition shadow-lg"
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
import { ref, watch } from 'vue';
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
  selectedId.value = p.id;
  form.value = { ...p };
  availableModels.value = p.availableModels || [];
}

function handleNewProvider() {
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

function handleDelete() {
  if (confirm(`Hapus provider "${form.value.name}"?`)) {
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
</script>
