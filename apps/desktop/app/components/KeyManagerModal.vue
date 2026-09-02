<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-40 flex items-center justify-center p-4">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-5">
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <div class="flex items-center space-x-2">
          <span class="text-base">🔑</span>
          <h3 class="text-lg font-bold text-slate-100">SSH Key Vault (E2EE Synced)</h3>
        </div>
        <button @click="$emit('close')" class="text-slate-400 hover:text-slate-200">✕</button>
      </div>

      <p class="text-xs text-slate-400">
        All SSH private keys stored here are encrypted with your Master Password and automatically synced across all your connected devices.
      </p>

      <!-- Key List -->
      <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
        <div v-if="vaultStore.vault.keys.length === 0" class="text-center py-6 text-xs text-slate-500 bg-boba-950/40 rounded-lg border border-boba-800">
          No SSH keys stored in vault. Import one below.
        </div>

        <div
          v-for="key in vaultStore.vault.keys"
          :key="key.id"
          class="p-3 bg-boba-950/60 border border-boba-800 rounded-lg flex items-center justify-between"
        >
          <div class="space-y-0.5 truncate mr-3">
            <div class="font-semibold text-xs text-slate-200 truncate">{{ key.name }}</div>
            <div class="font-mono text-[10px] text-slate-500 truncate">
              {{ getKeyType(key.private_key) }} • ID: {{ key.id }}
            </div>
          </div>
          <div class="flex items-center space-x-2 shrink-0">
            <button
              @click="copyKeyToClipboard(key.private_key)"
              title="Copy Private Key"
              class="px-2 py-1 bg-boba-800 hover:bg-boba-700 rounded text-xs text-slate-300"
            >
              Copy
            </button>
            <button
              @click="vaultStore.removeKey(key.id)"
              title="Delete Key"
              class="px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/40 rounded text-xs text-rose-400"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <!-- Add New Key Section -->
      <div class="border-t border-boba-800 pt-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-200">Import New Key</span>
          <label class="cursor-pointer px-2.5 py-1 bg-boba-800 hover:bg-boba-700 border border-boba-700 text-slate-200 text-xs rounded transition flex items-center space-x-1">
            <span>📂 Load from File...</span>
            <input
              type="file"
              @change="handleFileInput"
              class="hidden"
              accept=".pem,.key,.pub,id_rsa,id_ed25519,id_ecdsa,*"
            />
          </label>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div class="col-span-2">
            <input
              v-model="newKeyName"
              type="text"
              placeholder="Key Name (e.g. AWS Production Key)"
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
            />
          </div>
          <div>
            <button
              @click="handleAddKey"
              :disabled="!newKeyName.trim() || !newKeyContent.trim()"
              class="w-full py-1.5 bg-boba-accent hover:bg-boba-accent-hover disabled:opacity-50 text-white rounded text-xs font-medium transition"
            >
              Save Key
            </button>
          </div>
        </div>

        <textarea
          v-model="newKeyContent"
          placeholder="Paste private key content (-----BEGIN ... KEY-----)"
          rows="3"
          class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded p-2 text-xs text-slate-200 font-mono focus:outline-none"
        ></textarea>
      </div>

      <div class="flex justify-end pt-2">
        <button
          @click="$emit('close')"
          class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 text-xs font-medium rounded-lg"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useVaultStore } from '../stores/vaultStore.js';
import { useDialogStore } from '../stores/dialogStore.js';

defineProps<{ isOpen: boolean }>();
defineEmits(['close']);

const vaultStore = useVaultStore();
const dialogStore = useDialogStore();

const newKeyName = ref('');
const newKeyContent = ref('');

function getKeyType(keyText: string): string {
  if (keyText.includes('OPENSSH PRIVATE KEY')) return 'OpenSSH (ed25519/rsa)';
  if (keyText.includes('RSA PRIVATE KEY')) return 'RSA Private Key';
  if (keyText.includes('EC PRIVATE KEY')) return 'ECDSA Key';
  return 'Private Key';
}

function handleFileInput(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;

  const file = target.files[0];
  newKeyName.value = file.name;

  const reader = new FileReader();
  reader.onload = () => {
    newKeyContent.value = String(reader.result || '');
  };
  reader.readAsText(file);
}

async function handleAddKey() {
  if (!newKeyName.value.trim() || !newKeyContent.value.trim()) return;

  await vaultStore.saveKey({
    id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: newKeyName.value.trim(),
    private_key: newKeyContent.value.trim(),
  });

  newKeyName.value = '';
  newKeyContent.value = '';
}

async function copyKeyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
  await dialogStore.alert({
    title: 'Copied to Clipboard',
    description: 'Private SSH Key has been copied to your clipboard.',
    variant: 'success',
  });
}
</script>
