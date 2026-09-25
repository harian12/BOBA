<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-sans">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-base">
            🗄️
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-100">
              {{ form.id ? 'Edit Koneksi Database' : 'Koneksi Database Baru' }}
            </h3>
            <p class="text-[11px] text-slate-400">Tersimpan aman dengan E2EE Master Key</p>
          </div>
        </div>
        <button
          @click="$emit('close')"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 transition text-sm"
        >
          ✕
        </button>
      </div>

      <!-- Engine Selector Grid -->
      <div class="space-y-1.5">
        <label class="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Pilih Engine Database</label>
        <div class="grid grid-cols-5 gap-1.5">
          <button
            v-for="eng in engines"
            :key="eng.id"
            type="button"
            @click="selectEngine(eng.id)"
            :class="[
              'p-2 rounded-lg border text-center transition flex flex-col items-center justify-center space-y-1',
              form.engine === eng.id
                ? 'bg-sky-950/80 border-sky-500 text-sky-200 ring-1 ring-sky-500/40 shadow-sm'
                : 'bg-boba-950 border-boba-800 text-slate-400 hover:bg-boba-850 hover:text-slate-200'
            ]"
          >
            <span class="text-base">{{ eng.icon }}</span>
            <span class="text-[10px] font-semibold tracking-tight">{{ eng.label }}</span>
          </button>
        </div>
      </div>

      <!-- General Info -->
      <div class="grid grid-cols-3 gap-3">
        <div class="col-span-2 space-y-1">
          <label class="block text-xs font-semibold text-slate-300">Nama Koneksi *</label>
          <input
            v-model="form.name"
            type="text"
            placeholder="Contoh: Production DB / App Cache"
            class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none transition"
          />
        </div>
        <div class="space-y-1" v-if="form.engine !== 'sqlite'">
          <label class="block text-xs font-semibold text-slate-300">Port *</label>
          <input
            v-model.number="form.port"
            type="number"
            class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none font-mono"
          />
        </div>
      </div>

      <!-- SQLite Specific Field -->
      <div v-if="form.engine === 'sqlite'" class="space-y-1">
        <label class="block text-xs font-semibold text-slate-300">Path File Database (.db / .sqlite / .sqlite3) *</label>
        <div class="flex space-x-2">
          <input
            v-model="form.sqlite_path"
            type="text"
            placeholder="D:/data/app.sqlite atau C:/data/db.sqlite3"
            class="flex-1 bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none font-mono"
          />
          <button
            type="button"
            @click="browseSqliteFile"
            class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs font-medium transition flex items-center space-x-1"
          >
            <span>📂 Browse</span>
          </button>
        </div>
      </div>

      <!-- Network DB Fields (MySQL, Postgres, Redis, Mongo) -->
      <template v-else>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="block text-xs font-semibold text-slate-300">Host / IP Address *</label>
            <input
              v-model="form.host"
              type="text"
              placeholder="127.0.0.1 atau remote.host.com"
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none font-mono"
            />
          </div>
          <div class="space-y-1" v-if="form.engine !== 'redis'">
            <label class="block text-xs font-semibold text-slate-300">Database / Schema Default</label>
            <input
              v-model="form.database"
              type="text"
              :placeholder="form.engine === 'postgres' ? 'postgres' : 'boba_db'"
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none font-mono"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1" v-if="form.engine !== 'redis'">
            <label class="block text-xs font-semibold text-slate-300">Username</label>
            <input
              v-model="form.username"
              type="text"
              placeholder="root / postgres"
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none font-mono"
            />
          </div>
          <div class="space-y-1" :class="form.engine === 'redis' ? 'col-span-2' : ''">
            <label class="block text-xs font-semibold text-slate-300">
              {{ form.engine === 'redis' ? 'Redis Password / AUTH (opsional)' : 'Password' }}
            </label>
            <input
              v-model="form.password"
              type="password"
              placeholder="••••••••"
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none font-mono"
            />
          </div>
        </div>
      </template>

      <!-- SSH Tunneling Options -->
      <div class="bg-boba-950/70 border border-boba-800 rounded-xl p-3.5 space-y-2.5">
        <div class="flex items-center justify-between">
          <label class="flex items-center space-x-2 cursor-pointer">
            <input
              v-model="form.ssh_tunnel_enabled"
              type="checkbox"
              class="rounded border-boba-700 bg-boba-950 text-sky-500 focus:ring-0"
            />
            <span class="text-xs font-semibold text-slate-200">Gunakan SSH Tunneling</span>
          </label>
          <span class="text-[10px] text-sky-400 font-mono">Port Forwarding via SSH</span>
        </div>

        <div v-if="form.ssh_tunnel_enabled" class="space-y-1 pt-1 border-t border-boba-800">
          <label class="block text-[11px] text-slate-400">Pilih Sesi SSH Vault:</label>
          <select
            v-model="form.ssh_session_id"
            class="w-full bg-boba-900 border border-boba-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">-- Pilih Sesi SSH Terdaftar --</option>
            <option
              v-for="sess in vaultStore.vault.sessions"
              :key="sess.id"
              :value="sess.id"
            >
              {{ sess.name || sess.host }} ({{ sess.username }}@{{ sess.host }}:{{ sess.port }})
            </option>
          </select>
        </div>
      </div>

      <!-- Test Connection Result Banner -->
      <div v-if="testResult" class="p-3 rounded-lg text-xs font-mono" :class="testResult.success ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border border-rose-800 text-rose-300'">
        <div class="flex items-start space-x-2">
          <span>{{ testResult.success ? '✅' : '❌' }}</span>
          <span class="break-all">{{ testResult.message }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="border-t border-boba-800 pt-3 flex items-center justify-between">
        <button
          type="button"
          @click="handleTestConnection"
          :disabled="testing"
          class="px-3.5 py-1.5 bg-boba-800 hover:bg-boba-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border border-boba-700"
        >
          <span v-if="testing" class="w-3 h-3 border border-sky-400 border-t-transparent rounded-full animate-spin"></span>
          <span>{{ testing ? 'Menguji...' : '⚡ Test Koneksi' }}</span>
        </button>

        <div class="flex items-center space-x-2">
          <button
            type="button"
            @click="$emit('close')"
            class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded-lg text-xs transition"
          >
            Batal
          </button>
          <button
            type="button"
            @click="handleSave"
            class="px-4 py-1.5 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-lg text-xs font-medium shadow-md transition"
          >
            Simpan Koneksi
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useVaultStore } from '../stores/vaultStore.js';
import { useDbmsStore } from '../stores/dbmsStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import { tauriBridge } from '../services/tauriBridge.js';
import type { DbConnectionConfig } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
  dbConfig?: DbConnectionConfig | null;
}>();

const emit = defineEmits(['close', 'saved']);

const vaultStore = useVaultStore();
const dbmsStore = useDbmsStore();
const dialogStore = useDialogStore();

const engines = [
  { id: 'mysql', label: 'MySQL', icon: '🐬', defaultPort: 3306, defaultUser: 'root' },
  { id: 'postgres', label: 'PostgreSQL', icon: '🐘', defaultPort: 5432, defaultUser: 'postgres' },
  { id: 'sqlite', label: 'SQLite', icon: '🗃️', defaultPort: 0, defaultUser: '' },
  { id: 'redis', label: 'Redis', icon: '⚡', defaultPort: 6379, defaultUser: '' },
  { id: 'mongodb', label: 'MongoDB', icon: '🍃', defaultPort: 27017, defaultUser: '' },
] as const;

const form = ref<DbConnectionConfig>({
  id: '',
  name: '',
  engine: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  username: 'root',
  password: '',
  database: '',
  ssl: false,
  sqlite_path: '',
  ssh_tunnel_enabled: false,
  ssh_session_id: '',
});

const testing = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

function selectEngine(engId: any) {
  form.value.engine = engId;
  const eng = engines.find(e => e.id === engId);
  if (eng) {
    if (eng.defaultPort > 0) form.value.port = eng.defaultPort;
    if (eng.defaultUser) form.value.username = eng.defaultUser;
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      testResult.value = null;
      if (props.dbConfig) {
        form.value = JSON.parse(JSON.stringify(props.dbConfig));
      } else {
        form.value = {
          id: `db_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: '',
          engine: 'mysql',
          host: '127.0.0.1',
          port: 3306,
          username: 'root',
          password: '',
          database: '',
          ssl: false,
          sqlite_path: '',
          ssh_tunnel_enabled: false,
          ssh_session_id: '',
        };
      }
    }
  }
);

async function browseSqliteFile() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'SQLite Database',
          extensions: ['db', 'sqlite', 'sqlite3', 'db3', 's3db'],
        },
        {
          name: 'All Files',
          extensions: ['*'],
        },
      ],
    });

    if (selected && typeof selected === 'string') {
      form.value.sqlite_path = selected;
      if (!form.value.name) {
        const parts = selected.replace(/\\/g, '/').split('/');
        const fileName = parts[parts.length - 1] || 'SQLite DB';
        form.value.name = fileName;
      }
    }
  } catch (err) {
    console.error('File dialog error:', err);
  }
}

async function handleTestConnection() {
  if (!form.value.name) form.value.name = `${form.value.engine.toUpperCase()} Test`;
  testing.value = true;
  testResult.value = null;

  try {
    const res = await tauriBridge.dbmsTestConnection(form.value);
    testResult.value = { success: true, message: res };
  } catch (err: any) {
    testResult.value = { success: false, message: String(err?.message || err) };
  } finally {
    testing.value = false;
  }
}

async function handleSave() {
  if (!form.value.name.trim()) {
    await dialogStore.alert({
      title: 'Nama Koneksi Diperlukan',
      description: 'Harap berikan nama untuk koneksi database ini.',
      variant: 'error',
    });
    return;
  }

  if (form.value.engine === 'sqlite' && !form.value.sqlite_path?.trim()) {
    await dialogStore.alert({
      title: 'Path SQLite Diperlukan',
      description: 'Harap tentukan path file database SQLite lokal.',
      variant: 'error',
    });
    return;
  }

  await dbmsStore.saveDatabase(form.value);
  emit('saved', form.value);
  emit('close');
}
</script>
