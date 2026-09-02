<template>
  <div class="h-screen w-screen flex flex-col bg-boba-950 text-slate-100 overflow-hidden select-none">
    <!-- Top Global App Bar -->
    <header class="h-9 bg-boba-950 border-b border-boba-800 flex items-center justify-between px-3 text-xs shrink-0">
      <div class="flex items-center space-x-2">
        <span class="font-bold text-slate-300">BOBA</span>
        <span class="text-slate-600">|</span>
        <span class="text-slate-400 text-[11px]">Windows Remote Terminal & SFTP Suite</span>
      </div>

      <!-- Sync Status Pill -->
      <div class="flex items-center space-x-2">
        <button
          @click="isSyncOpen = true"
          :class="['px-2.5 py-0.5 rounded-full text-[11px] font-mono flex items-center space-x-1.5 transition border', syncStore.token ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-400' : 'bg-boba-900 border-boba-700 text-slate-400']"
        >
          <span :class="['w-1.5 h-1.5 rounded-full', syncStore.token ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500']"></span>
          <span>{{ syncStore.token ? `Cloud Sync: v${vaultStore.vault.vault_version}` : 'Local Mode' }}</span>
        </button>
      </div>
    </header>

    <!-- Main Application Body -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Sidebar (Session Organizer) -->
      <Sidebar
        @new-session="handleOpenNewSession"
        @edit-session="handleOpenEditSession"
        @open-sync="isSyncOpen = true"
        @open-keys="isKeyManagerOpen = true"
      />

      <!-- Right Workspace Area -->
      <main class="flex-1 flex flex-col bg-boba-950 overflow-hidden">
        <!-- Tab Bar & Grid Layout Switcher -->
        <div class="h-9 bg-boba-900 border-b border-boba-800 flex items-center justify-between px-1 shrink-0">
          <!-- Left: Tab List -->
          <div class="flex-1 flex items-center overflow-x-auto no-scrollbar h-full">
            <div
              v-for="tab in sessionStore.tabs"
              :key="tab.id"
              @click="sessionStore.activeTabId = tab.id"
              :class="['group flex items-center space-x-2 px-3 py-1.5 border-r border-boba-800 text-xs cursor-pointer font-mono transition h-full', sessionStore.activeTabId === tab.id ? 'bg-boba-950 text-slate-100 border-t-2 border-t-boba-accent' : 'bg-boba-900 text-slate-400 hover:bg-boba-850 hover:text-slate-200']"
            >
              <!-- Tab Type Icon / Indicator -->
              <span v-if="tab.type === 'editor'" class="text-xs shrink-0">
                📄
              </span>
              <span
                v-else
                :class="['w-1.5 h-1.5 rounded-full shrink-0', tab.connected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-amber-400 animate-pulse']"
                :title="tab.connected ? 'Connected' : 'Connecting/Disconnected'"
              ></span>

              <span class="truncate max-w-[130px]">{{ tab.title }}</span>

              <!-- Modified dirty indicator for editor tabs -->
              <span
                v-if="tab.type === 'editor' && tab.editorFile?.isDirty"
                class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse"
                title="Unsaved changes"
              ></span>

              <!-- Tab Quick Actions: Duplicate & Close -->
              <div class="flex items-center space-x-1 shrink-0">
                <!-- Duplicate Tab Button (Terminal only) -->
                <button
                  v-if="tab.type !== 'editor'"
                  @click.stop="sessionStore.duplicateTab(tab.id)"
                  title="Duplicate Tab (Open second SSH session)"
                  class="opacity-0 group-hover:opacity-100 hover:text-sky-400 text-[11px] p-0.5 rounded hover:bg-boba-800 transition"
                >
                  ⧉
                </button>

                <!-- Close Tab Button -->
                <button
                  @click.stop="handleCloseTab(tab)"
                  title="Close Tab (Ctrl+W)"
                  class="opacity-0 group-hover:opacity-100 hover:text-rose-400 text-[10px] p-0.5 rounded hover:bg-boba-800 transition"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Quick Duplicate Active Session Button -->
            <button
              v-if="sessionStore.activeTabId"
              @click="sessionStore.duplicateTab(sessionStore.activeTabId)"
              title="Duplicate Current Session to New Tab"
              class="px-2 py-1 ml-1 text-slate-400 hover:text-white hover:bg-boba-800 rounded text-xs transition"
            >
              +
            </button>

            <!-- Empty State Tab Hint -->
            <div v-if="sessionStore.tabs.length === 0" class="px-3 text-xs text-slate-500 font-mono">
              No active session tabs. Double click a session on the left to connect.
            </div>
          </div>

          <!-- Right: Dynamic Grid Split Selector (1, 2, 3, 4) -->
          <div v-if="sessionStore.tabs.length > 0" class="flex items-center space-x-1 px-2 border-l border-boba-800 shrink-0 bg-boba-900">
            <span class="text-[10px] text-slate-500 font-mono uppercase mr-1">Grid:</span>
            
            <!-- 1 Single Tab -->
            <button
              @click="sessionStore.setLayoutMode('1')"
              :class="['px-2 py-1 rounded text-xs font-mono transition', sessionStore.layoutMode === '1' ? 'bg-boba-accent text-white font-bold' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
              title="Single Fullscreen"
            >
              1
            </button>

            <!-- 2 Split Columns (Horizontal) -->
            <button
              @click="sessionStore.setLayoutMode('2-col')"
              :class="['px-2 py-1 rounded text-xs font-mono transition', sessionStore.layoutMode === '2-col' ? 'bg-boba-accent text-white font-bold' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
              title="2 Split Columns (Side by Side)"
            >
              2❚❚
            </button>

            <!-- 2 Split Rows (Vertical) -->
            <button
              @click="sessionStore.setLayoutMode('2-row')"
              :class="['px-2 py-1 rounded text-xs font-mono transition', sessionStore.layoutMode === '2-row' ? 'bg-boba-accent text-white font-bold' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
              title="2 Split Rows (Top & Bottom)"
            >
              2☰
            </button>

            <!-- 3 Grid -->
            <button
              @click="sessionStore.setLayoutMode('3')"
              :class="['px-2 py-1 rounded text-xs font-mono transition', sessionStore.layoutMode === '3' ? 'bg-boba-accent text-white font-bold' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
              title="3 Split Columns"
            >
              3
            </button>

            <!-- 4 Grid (2x2 Quad) -->
            <button
              @click="sessionStore.setLayoutMode('4')"
              :class="['px-2 py-1 rounded text-xs font-mono transition', sessionStore.layoutMode === '4' ? 'bg-boba-accent text-white font-bold' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
              title="4 Quadrant Grid (2x2)"
            >
              4⊞
            </button>
          </div>
        </div>

        <!-- Dynamic Grid Workspace Content -->
        <div class="flex-1 flex overflow-hidden p-1 bg-black/40">
          <div
            v-if="sessionStore.tabs.length > 0"
            :class="[
              'w-full h-full gap-1',
              sessionStore.layoutMode === '1' ? 'flex' : '',
              sessionStore.layoutMode === '2-col' ? 'grid grid-cols-2' : '',
              sessionStore.layoutMode === '2-row' ? 'grid grid-rows-2' : '',
              sessionStore.layoutMode === '3' ? 'grid grid-cols-3' : '',
              sessionStore.layoutMode === '4' ? 'grid grid-cols-2 grid-rows-2' : ''
            ]"
          >
            <div
              v-for="tab in sessionStore.tabs"
              :key="tab.id"
              v-show="isTabVisible(tab.id)"
              @click="sessionStore.activeTabId = tab.id"
              :class="[
                'flex h-full w-full overflow-hidden border rounded-lg shadow-inner bg-[#0b0d13] transition-colors',
                sessionStore.layoutMode === '1' ? 'flex-1 border-boba-800/60' : '',
                sessionStore.layoutMode !== '1' && sessionStore.activeTabId === tab.id ? 'border-sky-500/80 ring-1 ring-sky-500/40' : 'border-boba-800/80'
              ]"
            >
              <!-- Render Editor Tab or Terminal Tab -->
              <div class="flex-1 h-full overflow-hidden">
                <EditorTab v-if="tab.type === 'editor'" :tab="tab" />
                <TerminalTab v-else :tab="tab" />
              </div>

              <!-- Terminal SFTP Drawer -->
              <div v-if="tab.type !== 'editor' && tab.sftpOpen" class="h-full">
                <SftpDrawer
                  :session-id="tab.id"
                  :connected="tab.connected"
                  :host="tab.sessionConfig.host"
                  :username="tab.sessionConfig.username"
                  @close="sessionStore.toggleSftp(tab.id)"
                />
              </div>
            </div>
          </div>

          <!-- Welcome Workspace when no tabs are open -->
          <div v-if="sessionStore.tabs.length === 0" class="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div class="w-16 h-16 rounded-2xl bg-boba-accent/10 border border-boba-accent/30 flex items-center justify-center text-3xl font-black text-boba-accent">
              B
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-100">Welcome to BOBA</h2>
              <p class="text-xs text-slate-400 mt-1 max-w-sm">
                Tabbed SSH Terminal with integrated SFTP explorer, multi-tab dynamic grid split, and zero-knowledge encrypted cloud synchronization.
              </p>
            </div>
            <div class="flex space-x-3">
              <button
                @click="handleOpenNewSession()"
                class="px-4 py-2 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-lg text-xs font-medium transition shadow-lg"
              >
                + New SSH Session
              </button>
              <button
                @click="isSyncOpen = true"
                class="px-4 py-2 border border-boba-700 hover:bg-boba-800 rounded-lg text-xs font-medium text-slate-300 transition"
              >
                Setup Cloud Sync
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Modals & Overlays -->
    <TransferTray />
    <SyncModal :is-open="isSyncOpen" @close="isSyncOpen = false" />
    <KeyManagerModal :is-open="isKeyManagerOpen" @close="isKeyManagerOpen = false" />
    <NewSessionModal
      :is-open="isNewSessionOpen"
      :session-to-edit="sessionEditing"
      :folder-id="activeFolderId"
      @close="isNewSessionOpen = false"
    />
    <VaultLockModal />
    <AppDialog />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import Sidebar from './components/Sidebar.vue';
import TerminalTab from './components/TerminalTab.vue';
import EditorTab from './components/EditorTab.vue';
import SftpDrawer from './components/SftpDrawer.vue';
import TransferTray from './components/TransferTray.vue';
import VaultLockModal from './components/VaultLockModal.vue';
import SyncModal from './components/SyncModal.vue';
import KeyManagerModal from './components/KeyManagerModal.vue';
import NewSessionModal from './components/NewSessionModal.vue';
import AppDialog from './components/AppDialog.vue';

import { useVaultStore } from './stores/vaultStore.js';
import { useSyncStore } from './stores/syncStore.js';
import { useSessionStore } from './stores/sessionStore.js';
import { useDialogStore } from './stores/dialogStore.js';
import type { SshSessionConfig, ActiveTab } from './types/index.js';

const vaultStore = useVaultStore();
const syncStore = useSyncStore();
const sessionStore = useSessionStore();
const dialogStore = useDialogStore();

const isSyncOpen = ref(false);
const isKeyManagerOpen = ref(false);
const isNewSessionOpen = ref(false);
const sessionEditing = ref<SshSessionConfig | null>(null);
const activeFolderId = ref<string | null>(null);

function isTabVisible(tabId: string): boolean {
  return sessionStore.visibleTabs.some(t => t.id === tabId);
}

async function handleCloseTab(tab: ActiveTab) {
  if (tab.type === 'editor' && tab.editorFile?.isDirty) {
    const confirm = await dialogStore.confirm({
      title: `Close without saving "${tab.editorFile.name}"?`,
      description: 'You have unsaved changes in this file. Closing the tab will discard them.',
      confirmText: 'Discard & Close',
      isDestructive: true,
    });
    if (!confirm) return;
  }
  sessionStore.closeTab(tab.id);
}

function handleKeyDown(e: KeyboardEvent) {
  // Ctrl+Tab & Ctrl+Shift+Tab
  if (e.ctrlKey && (e.key === 'Tab' || e.code === 'Tab')) {
    e.preventDefault();
    if (e.shiftKey) {
      sessionStore.prevTab();
    } else {
      sessionStore.nextTab();
    }
  } else if (e.ctrlKey && (e.key === '`' || e.code === 'Backquote')) {
    e.preventDefault();
    sessionStore.nextTab();
  } else if (e.ctrlKey && e.key === 'PageDown') {
    e.preventDefault();
    sessionStore.nextTab();
  } else if (e.ctrlKey && e.key === 'PageUp') {
    e.preventDefault();
    sessionStore.prevTab();
  } else if (e.altKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    sessionStore.selectTabByIndex(parseInt(e.key, 10) - 1);
  } else if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    sessionStore.nextTab();
  } else if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    sessionStore.prevTab();
  } else if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
    if (!isSyncOpen.value && !isKeyManagerOpen.value && !isNewSessionOpen.value) {
      if (sessionStore.activeTabId) {
        e.preventDefault();
        const curTab = sessionStore.tabs.find(t => t.id === sessionStore.activeTabId);
        if (curTab) {
          handleCloseTab(curTab);
        }
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, { capture: true });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, { capture: true });
});

function handleOpenNewSession(folderId?: string) {
  sessionEditing.value = null;
  activeFolderId.value = folderId || null;
  isNewSessionOpen.value = true;
}

function handleOpenEditSession(session: SshSessionConfig) {
  sessionEditing.value = session;
  isNewSessionOpen.value = true;
}
</script>
