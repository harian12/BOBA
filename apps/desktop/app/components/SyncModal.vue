<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-40 flex items-center justify-center p-4 select-none">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5">
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <h3 class="text-lg font-bold text-slate-100">Multi-Device Cloud Sync</h3>
        <button @click="$emit('close')" class="text-slate-400 hover:text-slate-200">✕</button>
      </div>

      <!-- Sync Server URL Configuration -->
      <div class="space-y-1.5">
        <label class="block text-xs font-semibold text-slate-300">Sync Server URL</label>
        <div class="flex space-x-2">
          <input
            v-model="serverUrlInput"
            type="url"
            class="flex-1 bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
          />
          <button
            @click="handleSaveUrl"
            class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 rounded-lg text-xs font-medium text-slate-200 transition"
          >
            Save
          </button>
        </div>
      </div>

      <!-- Logged In State -->
      <div v-if="syncStore.token" class="space-y-4 bg-boba-950/50 p-4 rounded-xl border border-boba-800">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-emerald-400 flex items-center space-x-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Connected & Authenticated</span>
            </div>
            <div class="text-xs text-slate-300 mt-1 font-mono">{{ syncStore.userEmail }}</div>
          </div>
          <button
            @click="syncStore.logout"
            class="px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-950/40 rounded border border-rose-900/40 transition"
          >
            Logout
          </button>
        </div>

        <div class="text-xs text-slate-400 flex justify-between border-t border-boba-800 pt-3">
          <span>Vault Version: <strong class="text-slate-200">{{ vaultStore.vault.vault_version }}</strong></span>
          <span>Last Synced: <strong class="text-slate-200">{{ syncStore.lastSyncTime || 'Never' }}</strong></span>
        </div>

        <!-- Sync Error & Recovery Actions -->
        <div v-if="syncStore.syncError" class="text-xs text-rose-400 bg-rose-950/50 p-3 rounded-lg border border-rose-900/60 space-y-2">
          <div>{{ syncStore.syncError }}</div>
          <div class="pt-2 border-t border-rose-900/40 flex flex-col space-y-2">
            <button
              @click="handleForcePull"
              class="w-full py-1.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-100 rounded text-[11px] font-medium transition"
            >
              📥 Tarik & Pulihkan Data dari Server (Timpa Lokal)
            </button>
            <button
              @click="handleForcePush"
              class="w-full py-1.5 bg-rose-900/60 hover:bg-rose-800 text-white rounded text-[11px] font-medium transition"
            >
              📤 Upload & Timpa Data Server dengan Data PC Ini
            </button>
          </div>
        </div>

        <!-- Normal Actions -->
        <div class="flex space-x-2 pt-1">
          <button
            @click="handleForcePull"
            :disabled="syncStore.isSyncing"
            class="flex-1 py-2 bg-[#232936] hover:bg-[#2d3546] text-slate-200 rounded-lg text-xs font-medium transition disabled:opacity-50 flex items-center justify-center space-x-1"
            title="Download latest vault from server"
          >
            <span>📥</span>
            <span>Tarik dari Server</span>
          </button>
          <button
            @click="handleSyncNow"
            :disabled="syncStore.isSyncing"
            class="flex-1 py-2 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-lg text-xs font-medium transition disabled:opacity-50 flex items-center justify-center space-x-1 shadow-md"
          >
            <span v-if="syncStore.isSyncing">Syncing...</span>
            <span v-else>🔄 Sync Now</span>
          </button>
        </div>
      </div>

      <!-- Log In / Register Form -->
      <div v-else class="space-y-4">
        <div class="flex border-b border-boba-800">
          <button
            @click="mode = 'login'"
            :class="['flex-1 py-2 text-xs font-semibold text-center border-b-2 transition', mode === 'login' ? 'border-boba-accent text-boba-accent' : 'border-transparent text-slate-400']"
          >
            Log In
          </button>
          <button
            @click="mode = 'register'"
            :class="['flex-1 py-2 text-xs font-semibold text-center border-b-2 transition', mode === 'register' ? 'border-boba-accent text-boba-accent' : 'border-transparent text-slate-400']"
          >
            Create Account
          </button>
        </div>

        <form @submit.prevent="handleAuthSubmit" class="space-y-3">
          <div>
            <label class="block text-xs text-slate-300 mb-1">Email</label>
            <input
              v-model="emailInput"
              type="email"
              required
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs text-slate-300 mb-1">Account Password</label>
            <input
              v-model="passwordInput"
              type="password"
              required
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
            />
          </div>

          <div v-if="syncStore.syncError" class="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded border border-rose-900/50">
            {{ syncStore.syncError }}
          </div>

          <button
            type="submit"
            :disabled="authLoading"
            class="w-full py-2 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-lg text-xs font-medium transition disabled:opacity-50 shadow-md"
          >
            <span v-if="authLoading">Processing...</span>
            <span v-else>{{ mode === 'login' ? 'Log In & Connect' : 'Register & Connect' }}</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSyncStore } from '../stores/syncStore.js';
import { useVaultStore } from '../stores/vaultStore.js';
import { useDialogStore } from '../stores/dialogStore.js';

defineProps<{ isOpen: boolean }>();
defineEmits(['close']);

const syncStore = useSyncStore();
const vaultStore = useVaultStore();
const dialogStore = useDialogStore();

const mode = ref<'login' | 'register'>('login');
const serverUrlInput = ref(syncStore.serverUrl);
const emailInput = ref('');
const passwordInput = ref('');
const authLoading = ref(false);

function handleSaveUrl() {
  syncStore.setServerUrl(serverUrlInput.value);
}

async function handleSyncNow() {
  await syncStore.syncVault();
}

async function handleForcePull() {
  await syncStore.forcePullRemote();
  if (syncStore.syncError && syncStore.syncError.includes('tidak cocok')) {
    const customPwd = await dialogStore.prompt({
      title: 'Masukkan Master Password Cloud Vault',
      description: 'Data di server dienkripsi dengan Master Password atau salt yang berbeda. Masukkan Master Password dari PC pembuat data untuk membuka enkripsi:',
      placeholder: 'Master Password...',
      confirmText: 'Buka & Pulihkan',
    });
    if (customPwd) {
      await syncStore.forcePullRemote(customPwd);
    }
  }
}

async function handleAuthSubmit() {
  authLoading.value = true;
  try {
    if (mode.value === 'login') {
      await syncStore.login(emailInput.value, passwordInput.value);
    } else {
      await syncStore.register(emailInput.value, passwordInput.value);
    }
    await syncStore.syncVault();
  } catch (err) {
    // handled by store
  } finally {
    authLoading.value = false;
  }
}

async function handleForcePush() {
  const confirmed = await dialogStore.confirm({
    title: 'Overwrite Cloud Vault?',
    description: 'Apakah Anda yakin ingin menimpa data di cloud dengan data sesi lokal PC ini menggunakan Master Password saat ini?',
    confirmText: 'Upload & Overwrite Cloud',
    isDestructive: true,
  });
  if (confirmed) {
    await syncStore.forcePushLocal();
  }
}
</script>
