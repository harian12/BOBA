<template>
  <aside class="w-72 bg-boba-900 border-r border-boba-800 flex flex-col h-full select-none">
    <!-- Brand / Header -->
    <div class="px-4 py-3 border-b border-boba-800 flex items-center justify-between">
      <div class="flex items-center space-x-2.5">
        <div class="w-7 h-7 rounded-lg bg-boba-accent flex items-center justify-center font-black text-sm text-white shadow-md">
          B
        </div>
        <span class="font-bold text-sm tracking-wide text-slate-100">BOBA</span>
      </div>

      <div class="flex items-center space-x-1.5">
        <!-- SSH Keys Manager Button -->
        <button
          @click="$emit('open-keys')"
          title="SSH Key Vault (E2EE)"
          class="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-boba-800 rounded-md transition text-xs"
        >
          🔑
        </button>

        <!-- Sync Trigger Button -->
        <button
          @click="$emit('open-sync')"
          :title="syncStore.token ? `Logged in as ${syncStore.userEmail}` : 'Configure Cloud Sync'"
          class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-boba-800 rounded-md transition"
        >
          <span :class="['inline-block text-xs', syncStore.token ? 'text-emerald-400' : 'text-slate-400']">☁️</span>
        </button>

        <!-- Lock Vault Button -->
        <button
          @click="vaultStore.lock"
          title="Lock Vault"
          class="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-boba-800 rounded-md transition text-xs"
        >
          🔒
        </button>
      </div>
    </div>

    <!-- Search / Filter -->
    <div class="px-3 py-2 border-b border-boba-800">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Filter sessions..."
        class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition"
      />
    </div>

    <!-- Action Toolbar (Add Session / Folder) -->
    <div class="px-3.5 py-2 flex items-center justify-between border-b border-boba-800 text-xs">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sessions</span>
      <div class="flex items-center space-x-2">
        <button
          @click="promptNewFolder"
          title="New Folder"
          class="px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-boba-800 rounded text-[11px] transition"
        >
          + Folder
        </button>
        <button
          @click="$emit('new-session')"
          title="New SSH Session"
          class="px-2.5 py-1 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-md text-[11px] font-medium shadow-sm transition"
        >
          + Session
        </button>
      </div>
    </div>

    <!-- Session Hierarchy Tree -->
    <div class="flex-1 overflow-y-auto p-2.5 space-y-1 text-xs font-sans">
      <div v-if="filteredFolders.length === 0 && unorganizedSessions.length === 0" class="p-6 text-center text-slate-500">
        No sessions found. Click "+ Session" to add.
      </div>

      <!-- Folders -->
      <div v-for="folder in filteredFolders" :key="folder.id" class="space-y-0.5">
        <div
          @click="toggleFolder(folder.id)"
          class="flex items-center justify-between px-2.5 py-1.5 hover:bg-boba-800/70 rounded-lg group cursor-pointer transition select-none"
        >
          <div class="flex items-center space-x-2 truncate mr-2">
            <!-- Chevron Dropdown Indicator -->
            <span class="text-[10px] text-slate-400 transition-transform duration-150 inline-block w-3 text-center">
              {{ isFolderCollapsed(folder.id) ? '▶' : '▼' }}
            </span>
            <span class="text-amber-400 text-sm">📁</span>
            <span class="font-semibold text-slate-200 truncate text-[13px]">{{ folder.name }}</span>
            <span class="text-[10px] text-slate-500 font-mono">({{ getSessionsInFolder(folder.id).length }})</span>
          </div>

          <div class="opacity-0 group-hover:opacity-100 flex items-center space-x-1.5 shrink-0 transition-opacity">
            <button
              @click.stop="$emit('new-session', folder.id)"
              title="Add Session to this folder"
              class="w-5 h-5 flex items-center justify-center rounded hover:bg-boba-700 text-slate-300 hover:text-white text-xs font-bold transition"
            >
              +
            </button>
            <button
              @click.stop="deleteFolder(folder)"
              title="Delete folder"
              class="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs transition"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Folder Children Sessions (Collapsible) -->
        <div v-show="!isFolderCollapsed(folder.id)" class="pl-5 pr-1 space-y-0.5">
          <div
            v-if="getSessionsInFolder(folder.id).length === 0"
            class="px-3 py-1 text-[11px] text-slate-600 italic"
          >
            Empty folder
          </div>

          <div
            v-for="session in getSessionsInFolder(folder.id)"
            :key="session.id"
            @dblclick="sessionStore.openSession(session, true)"
            class="flex items-center justify-between px-2.5 py-1.5 hover:bg-boba-800/80 rounded-md cursor-pointer group transition"
            title="Double click to open new tab"
          >
            <div class="flex items-center space-x-2 truncate mr-2">
              <span class="text-xs text-sky-400 font-mono font-bold">></span>
              <span class="text-slate-300 truncate font-mono text-[12px]">{{ session.name || session.host }}</span>
            </div>
            <div class="opacity-0 group-hover:opacity-100 flex items-center space-x-1 shrink-0 transition-opacity">
              <button
                @click.stop="$emit('edit-session', session)"
                title="Edit session"
                class="w-5 h-5 flex items-center justify-center rounded hover:bg-boba-700 text-slate-400 hover:text-slate-200 text-xs transition"
              >
                ✎
              </button>
              <button
                @click.stop="deleteSession(session)"
                title="Delete session"
                class="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs transition"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Root / Unorganized Sessions -->
      <div v-if="unorganizedSessions.length > 0" class="pt-1.5 space-y-0.5">
        <div
          v-for="session in unorganizedSessions"
          :key="session.id"
          @dblclick="sessionStore.openSession(session, true)"
          class="flex items-center justify-between px-2.5 py-1.5 hover:bg-boba-800/80 rounded-lg cursor-pointer group transition"
          title="Double click to open new tab"
        >
          <div class="flex items-center space-x-2.5 truncate mr-2">
            <span class="text-xs text-sky-400 font-mono font-bold">></span>
            <span class="text-slate-300 truncate font-mono text-[12px]">{{ session.name || session.host }}</span>
          </div>
          <div class="opacity-0 group-hover:opacity-100 flex items-center space-x-1 shrink-0 transition-opacity">
            <button
              @click.stop="$emit('edit-session', session)"
              title="Edit session"
              class="w-5 h-5 flex items-center justify-center rounded hover:bg-boba-700 text-slate-400 hover:text-slate-200 text-xs transition"
            >
              ✎
            </button>
            <button
              @click.stop="deleteSession(session)"
              title="Delete session"
              class="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs transition"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useVaultStore } from '../stores/vaultStore.js';
import { useSyncStore } from '../stores/syncStore.js';
import { useSessionStore } from '../stores/sessionStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import type { SshSessionConfig, Folder } from '../types/index.js';

defineEmits(['new-session', 'edit-session', 'open-sync', 'open-keys']);

const vaultStore = useVaultStore();
const syncStore = useSyncStore();
const sessionStore = useSessionStore();
const dialogStore = useDialogStore();

const searchQuery = ref('');
const collapsedFolders = ref<Record<string, boolean>>({});

function toggleFolder(folderId: string) {
  collapsedFolders.value[folderId] = !collapsedFolders.value[folderId];
}

function isFolderCollapsed(folderId: string): boolean {
  if (searchQuery.value) return false;
  return !!collapsedFolders.value[folderId];
}

const filteredFolders = computed(() => {
  if (!searchQuery.value) return vaultStore.vault.folders;
  return vaultStore.vault.folders.filter(f =>
    f.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    getSessionsInFolder(f.id).length > 0
  );
});

const unorganizedSessions = computed(() => {
  return vaultStore.vault.sessions.filter(s => {
    const matchesSearch = !searchQuery.value ||
      s.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      s.host.toLowerCase().includes(searchQuery.value.toLowerCase());
    return (!s.folder_id || !vaultStore.vault.folders.some(f => f.id === s.folder_id)) && matchesSearch;
  });
});

function getSessionsInFolder(folderId: string): SshSessionConfig[] {
  return vaultStore.vault.sessions.filter(s => {
    const matchesFolder = s.folder_id === folderId;
    const matchesSearch = !searchQuery.value ||
      s.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      s.host.toLowerCase().includes(searchQuery.value.toLowerCase());
    return matchesFolder && matchesSearch;
  });
}

async function promptNewFolder() {
  const name = await dialogStore.prompt({
    title: 'Create New Folder',
    description: 'Enter a folder name to organize your SSH sessions.',
    placeholder: 'e.g. Production Clusters',
    confirmText: 'Create Folder',
  });
  if (name && name.trim()) {
    await vaultStore.addFolder(name.trim());
  }
}

async function deleteFolder(folder: Folder) {
  const confirmed = await dialogStore.confirm({
    title: `Delete Folder "${folder.name}"?`,
    description: 'Sessions inside this folder will be moved to unorganized sessions.',
    confirmText: 'Delete Folder',
    isDestructive: true,
  });
  if (confirmed) {
    await vaultStore.removeFolder(folder.id);
  }
}

async function deleteSession(session: SshSessionConfig) {
  const confirmed = await dialogStore.confirm({
    title: `Delete Session "${session.name || session.host}"?`,
    description: 'This action cannot be undone.',
    confirmText: 'Delete Session',
    isDestructive: true,
  });
  if (confirmed) {
    await vaultStore.removeSession(session.id);
  }
}
</script>
