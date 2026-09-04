<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5">
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <div class="flex items-center space-x-2">
          <span class="text-base">🛡️</span>
          <h3 class="text-base font-bold text-slate-100">Ubah Master Password</h3>
        </div>
        <button @click="$emit('close')" class="text-slate-400 hover:text-slate-200">✕</button>
      </div>

      <p class="text-xs text-slate-400">
        Password ini digunakan untuk mengenkripsi seluruh sesi, SSH keys, dan snippets secara lokal & cloud (E2EE).
      </p>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Master Password Saat Ini</label>
          <input
            v-model="oldPassword"
            type="password"
            required
            placeholder="Masukkan password lama..."
            class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Master Password Baru</label>
          <input
            v-model="newPassword"
            type="password"
            required
            placeholder="Minimal 6 karakter..."
            class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Konfirmasi Master Password Baru</label>
          <input
            v-model="confirmPassword"
            type="password"
            required
            placeholder="Ketik ulang password baru..."
            class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
          />
        </div>

        <div v-if="errorMsg" class="text-xs text-rose-400 bg-rose-950/50 p-2.5 rounded border border-rose-900/60">
          {{ errorMsg }}
        </div>

        <div v-if="successMsg" class="text-xs text-emerald-400 bg-emerald-950/50 p-2.5 rounded border border-emerald-900/60">
          {{ successMsg }}
        </div>

        <div class="flex justify-end space-x-2 pt-2 border-t border-boba-800">
          <button
            type="button"
            @click="$emit('close')"
            class="px-3.5 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded-lg text-xs font-medium transition"
          >
            Batal
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="px-4 py-1.5 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-lg text-xs font-medium transition disabled:opacity-50 shadow-md flex items-center space-x-1.5"
          >
            <span v-if="loading">Menyimpan...</span>
            <span v-else>Simpan Perubahan</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useVaultStore } from '../stores/vaultStore.js';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits(['close']);

const vaultStore = useVaultStore();

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const errorMsg = ref('');
const successMsg = ref('');
const loading = ref(false);

watch(() => props.isOpen, (open) => {
  if (open) {
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    errorMsg.value = '';
    successMsg.value = '';
  }
});

async function handleSubmit() {
  errorMsg.value = '';
  successMsg.value = '';

  if (newPassword.value.length < 6) {
    errorMsg.value = 'Password baru minimal 6 karakter.';
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMsg.value = 'Konfirmasi password baru tidak cocok.';
    return;
  }

  loading.value = true;
  try {
    await vaultStore.changeMasterPassword(oldPassword.value, newPassword.value);
    successMsg.value = 'Master password berhasil diperbarui dan disinkronkan.';
    setTimeout(() => {
      emit('close');
    }, 1200);
  } catch (err: any) {
    errorMsg.value = String(err);
  } finally {
    loading.value = false;
  }
}
</script>
