<template>
  <div v-if="!vaultStore.isUnlocked" class="fixed inset-0 bg-boba-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-6">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-lg bg-boba-accent/20 border border-boba-accent/40 flex items-center justify-center text-boba-accent font-bold text-xl">
          B
        </div>
        <div>
          <h2 class="text-xl font-bold text-slate-100">BOBA Vault</h2>
          <p class="text-xs text-slate-400">
            {{ hasExistingVault ? 'Masukkan Master Password untuk membuka sesi' : 'Buat Master Password untuk mengamankan data' }}
          </p>
        </div>
      </div>

      <form @submit.prevent="handleUnlock" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
            {{ hasExistingVault ? 'Master Password' : 'Buat Master Password Baru' }}
          </label>
          <input
            v-model="passwordInput"
            type="password"
            autofocus
            placeholder="Ketik password master..."
            required
            class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
          />
        </div>

        <div v-if="errorMessage" class="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/50 rounded-lg p-2.5 space-y-2">
          <div>{{ errorMessage }}</div>
          <button
            type="button"
            @click="handleResetVault"
            class="text-[11px] text-rose-300 underline hover:text-white font-medium"
          >
            Lupa password? Reset data lokal & buat vault baru
          </button>
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-boba-accent hover:bg-boba-accent-hover text-white font-medium py-2 rounded-lg text-sm transition duration-150 disabled:opacity-50 flex items-center justify-center space-x-2 shadow-lg"
        >
          <span v-if="loading">Membuka Enkripsi...</span>
          <span v-else>{{ hasExistingVault ? 'Buka BOBA' : 'Simpan & Buka BOBA' }}</span>
        </button>
      </form>

      <div class="border-t border-boba-800 pt-4 text-center">
        <p class="text-xs text-slate-500">
          Password ini digunakan untuk mengenkripsi semua data SSH secara lokal (AES-256-GCM). Jangan sampai lupa.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useVaultStore } from '../stores/vaultStore.js';
import { useSyncStore } from '../stores/syncStore.js';
import { useDialogStore } from '../stores/dialogStore.js';

const vaultStore = useVaultStore();
const syncStore = useSyncStore();
const dialogStore = useDialogStore();

const passwordInput = ref('');
const errorMessage = ref('');
const loading = ref(false);
const hasExistingVault = ref(false);

onMounted(() => {
  const localBlob = localStorage.getItem('boba_local_vault_blob');
  hasExistingVault.value = !!localBlob;
  const cachedSalt = localStorage.getItem('boba_user_salt') || 'boba_default_offline_salt_123';
  if (!cachedSalt) {
    localStorage.setItem('boba_user_salt', cachedSalt);
  }
});

async function handleUnlock() {
  if (!passwordInput.value) return;
  loading.value = true;
  errorMessage.value = '';

  try {
    const localBlob = localStorage.getItem('boba_local_vault_blob') || undefined;
    const userSalt = syncStore.userSalt || localStorage.getItem('boba_user_salt') || 'boba_default_offline_salt_123';

    await vaultStore.unlock(passwordInput.value, userSalt, localBlob);
    passwordInput.value = '';
    
    // Auto-sync jika token ada
    if (syncStore.token) {
      syncStore.syncNow();
    }
  } catch (err: any) {
    errorMessage.value = 'Password salah. Tidak dapat mendekripsi vault yang tersimpan.';
  } finally {
    loading.value = false;
  }
}

async function handleResetVault() {
  const confirmed = await dialogStore.confirm({
    title: 'Reset Local Vault?',
    description: 'Yakin ingin mereset vault lokal? Data sesi lokal pada perangkat ini akan dibersihkan agar Anda dapat mengatur Master Password baru.',
    confirmText: 'Reset Vault',
    isDestructive: true,
  });
  if (!confirmed) return;
  
  localStorage.removeItem('boba_local_vault_blob');
  hasExistingVault.value = false;
  errorMessage.value = '';
  passwordInput.value = '';
}
</script>
