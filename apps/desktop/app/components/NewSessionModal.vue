<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-40 flex items-center justify-center p-4">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-boba-800 pb-3 shrink-0">
        <h3 class="text-lg font-bold text-slate-100">{{ isEditing ? 'Edit Session' : 'New SSH Session' }}</h3>
        <button @click="$emit('close')" class="text-slate-400 hover:text-slate-200">✕</button>
      </div>

      <!-- Navigation Tabs in Modal -->
      <div class="flex border-b border-boba-800 shrink-0">
        <button
          @click="activeTab = 'general'"
          :class="['px-4 py-2 text-xs font-semibold border-b-2 transition', activeTab === 'general' ? 'border-boba-accent text-boba-accent' : 'border-transparent text-slate-400 hover:text-slate-200']"
        >
          General & Auth
        </button>
        <button
          @click="activeTab = 'commands'"
          :class="['px-4 py-2 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5', activeTab === 'commands' ? 'border-boba-accent text-boba-accent' : 'border-transparent text-slate-400 hover:text-slate-200']"
        >
          <span>⚡ Quick Commands</span>
          <span v-if="form.snippets && form.snippets.length > 0" class="px-1.5 py-0.2 bg-boba-800 rounded-full text-[10px]">
            {{ form.snippets.length }}
          </span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto space-y-4 pr-1">
        <!-- Tab 1: General & Auth -->
        <form v-show="activeTab === 'general'" id="sessionForm" @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Session Name</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="e.g. Production Web 01"
              required
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none"
            />
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="col-span-2">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Host / IP</label>
              <input
                v-model="form.host"
                type="text"
                placeholder="192.168.1.100"
                required
                class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Port</label>
              <input
                v-model.number="form.port"
                type="number"
                required
                class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Username</label>
            <input
              v-model="form.username"
              type="text"
              placeholder="root / ubuntu / anaverse"
              required
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none"
            />
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-semibold text-slate-300 mb-1">Authentication Method</label>
            <div class="flex space-x-4 text-xs">
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="radio" value="password" v-model="form.auth_type" class="text-boba-accent focus:ring-0" />
                <span>Password</span>
              </label>
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="radio" value="key" v-model="form.auth_type" class="text-boba-accent focus:ring-0" />
                <span>SSH Private Key</span>
              </label>
            </div>

            <div v-if="form.auth_type === 'password'">
              <input
                v-model="form.password"
                type="password"
                placeholder="Enter SSH password"
                class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none"
              />
            </div>

            <div v-else class="space-y-3 bg-boba-950/40 p-3 rounded-lg border border-boba-800">
              <!-- Stored Key Selection -->
              <div v-if="vaultStore.vault.keys.length > 0">
                <label class="block text-[11px] text-slate-400 mb-1">Stored Key</label>
                <select
                  v-model="form.key_id"
                  class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
                >
                  <option :value="undefined">Import new key from file or paste</option>
                  <option v-for="k in vaultStore.vault.keys" :key="k.id" :value="k.id">{{ k.name }}</option>
                </select>
              </div>

              <!-- Import from File / Direct input -->
              <div v-if="!form.key_id" class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="block text-[11px] font-semibold text-slate-300">Load Private Key from File</label>
                  <label class="cursor-pointer px-2.5 py-1 bg-boba-800 hover:bg-boba-700 border border-boba-700 text-slate-200 text-xs rounded transition flex items-center space-x-1">
                    <span>📂 Choose File...</span>
                    <input
                      type="file"
                      @change="handleFileInput"
                      class="hidden"
                      accept=".pem,.key,.pub,id_rsa,id_ed25519,id_ecdsa,*"
                    />
                  </label>
                </div>

                <div>
                  <textarea
                    v-model="rawKeyInput"
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                    rows="4"
                    class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg p-2 font-mono text-[11px] text-slate-100 focus:outline-none"
                  ></textarea>
                </div>
                <div>
                  <label class="block text-[11px] text-slate-400 mb-0.5">Key Passphrase (Optional)</label>
                  <input
                    v-model="keyPassphrase"
                    type="password"
                    placeholder="If key is encrypted with passphrase"
                    class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1 text-xs text-slate-100 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center space-x-2 pt-2">
            <input type="checkbox" id="sftpAuto" v-model="form.sftp_auto_open" class="rounded bg-boba-950 border-boba-700 text-boba-accent focus:ring-0" />
            <label for="sftpAuto" class="text-xs text-slate-300">Auto-open SFTP Explorer on connection</label>
          </div>
        </form>

        <!-- Tab 2: Custom Quick Commands for this Session -->
        <div v-show="activeTab === 'commands'" class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-400">Custom Quick Commands for this server</span>
            <button
              @click="addSnippet"
              type="button"
              class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 text-sky-400 rounded text-xs font-medium transition"
            >
              + Add Command
            </button>
          </div>

          <div v-if="!form.snippets || form.snippets.length === 0" class="p-6 text-center text-slate-500 border border-dashed border-boba-800 rounded-lg text-xs">
            No custom commands set for this session yet. Click "+ Add Command" above to add commands like <code class="text-sky-400 font-mono">pm2 restart all</code>, <code class="text-sky-400 font-mono">docker compose logs</code>, etc.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="(snp, idx) in form.snippets"
              :key="snp.id"
              class="p-3 bg-boba-950/60 border border-boba-800 rounded-lg space-y-2 relative group"
            >
              <div class="flex items-center justify-between space-x-2">
                <input
                  v-model="snp.title"
                  type="text"
                  placeholder="Command Title (e.g. Restart Docker)"
                  class="flex-1 bg-boba-900 border border-boba-700 focus:border-boba-accent rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                />
                <button
                  @click="removeSnippet(idx)"
                  type="button"
                  class="text-slate-500 hover:text-rose-400 text-xs px-2 py-1 rounded transition"
                  title="Remove command"
                >
                  ✕
                </button>
              </div>

              <div>
                <input
                  v-model="snp.command"
                  type="text"
                  placeholder="Bash Command (e.g. docker compose restart\n)"
                  class="w-full bg-boba-900 border border-boba-700 focus:border-boba-accent rounded px-2 py-1 font-mono text-xs text-sky-300 focus:outline-none"
                />
              </div>

              <div>
                <input
                  v-model="snp.description"
                  type="text"
                  placeholder="Short description (optional)"
                  class="w-full bg-transparent border-none text-[11px] text-slate-500 focus:outline-none p-0"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-end space-x-3 pt-3 border-t border-boba-800 shrink-0">
        <button
          type="button"
          @click="$emit('close')"
          class="px-4 py-2 border border-boba-700 hover:bg-boba-800 rounded-lg text-xs font-medium text-slate-300 transition"
        >
          Cancel
        </button>
        <button
          @click="handleSubmit"
          type="button"
          class="px-4 py-2 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-lg text-xs font-medium transition shadow-md"
        >
          {{ isEditing ? 'Save Changes' : 'Create Session' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useVaultStore } from '../stores/vaultStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import type { SshSessionConfig, SnippetItem } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
  sessionToEdit?: SshSessionConfig | null;
  folderId?: string | null;
}>();

const emit = defineEmits(['close']);
const vaultStore = useVaultStore();
const dialogStore = useDialogStore();

const activeTab = ref<'general' | 'commands'>('general');
const isEditing = computed(() => !!props.sessionToEdit);

const rawKeyInput = ref('');
const keyPassphrase = ref('');

const form = ref<SshSessionConfig>({
  id: '',
  folder_id: null,
  name: '',
  host: '',
  port: 22,
  username: 'root',
  auth_type: 'password',
  password: '',
  key_id: undefined,
  sftp_auto_open: false,
  snippets: [],
});

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      activeTab.value = 'general';
      if (props.sessionToEdit) {
        form.value = JSON.parse(JSON.stringify(props.sessionToEdit));
        if (!form.value.snippets) form.value.snippets = [];
      } else {
        form.value = {
          id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          folder_id: props.folderId || null,
          name: '',
          host: '',
          port: 22,
          username: 'root',
          auth_type: 'password',
          password: '',
          key_id: vaultStore.vault.keys[0]?.id || undefined,
          sftp_auto_open: false,
          snippets: [
            {
              id: `snp_${Date.now()}_1`,
              title: 'Check CPU & RAM',
              command: 'top -b -n 1 | head -n 20\n',
              description: 'Resource usage',
            },
            {
              id: `snp_${Date.now()}_2`,
              title: 'Check Disk Space',
              command: 'df -h\n',
              description: 'Storage usage',
            }
          ],
        };
        rawKeyInput.value = '';
        keyPassphrase.value = '';
      }
    }
  },
  { immediate: true }
);

function addSnippet() {
  if (!form.value.snippets) form.value.snippets = [];
  form.value.snippets.push({
    id: `snp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: 'New Command',
    command: 'echo "Hello"\n',
    description: '',
  });
}

function removeSnippet(index: number) {
  if (form.value.snippets) {
    form.value.snippets.splice(index, 1);
  }
}

function handleFileInput(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    const file = target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      rawKeyInput.value = (e.target?.result as string) || '';
    };
    reader.readAsText(file);
  }
}

async function handleSubmit() {
  if (!form.value.name || !form.value.host || !form.value.username) {
    activeTab.value = 'general';
    await dialogStore.alert({
      title: 'Incomplete Information',
      description: 'Please fill in Session Name, Host, and Username before saving.',
      variant: 'warning',
    });
    return;
  }

  // If using key auth and inputted raw key, save key to vault first
  if (form.value.auth_type === 'key' && !form.value.key_id && rawKeyInput.value.trim()) {
    const keyId = `key_${Date.now()}`;
    await vaultStore.saveKey({
      id: keyId,
      name: `${form.value.name} Key`,
      private_key: rawKeyInput.value.trim(),
      passphrase: keyPassphrase.value || undefined,
    });
    form.value.key_id = keyId;
  }

  // Ensure commands ending with newline
  if (form.value.snippets) {
    form.value.snippets.forEach(s => {
      if (s.command && !s.command.endsWith('\n')) {
        s.command += '\n';
      }
    });
  }

  await vaultStore.saveSession({ ...form.value });
  emit('close');
}
</script>
