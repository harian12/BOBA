<template>
  <div class="h-screen w-screen flex flex-col bg-boba-950 text-slate-100 overflow-hidden select-none">
    <!-- Top Global App Bar -->
    <header class="h-9 bg-boba-950 border-b border-boba-800 flex items-center justify-between px-3 text-xs shrink-0">
      <div class="flex items-center space-x-2">
        <span class="font-bold text-slate-300">BOBA</span>
        <button
          @click="isUpdateOpen = true"
          title="Versi Aplikasi BOBA (Klik untuk cek pembaruan)"
          class="px-1.5 py-0.2 bg-boba-900 hover:bg-boba-800 text-slate-400 hover:text-sky-300 border border-boba-750 rounded text-[10px] font-mono transition"
        >
          v0.1.5
        </button>
        <span class="text-slate-600">|</span>
        <span class="text-slate-400 text-[11px]">Windows Remote Terminal & SFTP Suite</span>
      </div>

      <!-- Sync Status Pill & Update Pill -->
      <div class="flex items-center space-x-2">
        <button
          v-if="hasUpdateAvailable"
          @click="isUpdateOpen = true"
          class="px-2.5 py-0.5 rounded-full text-[11px] font-mono flex items-center space-x-1.5 transition border bg-sky-950/70 border-sky-500 text-sky-300 hover:bg-sky-900"
          title="Versi baru tersedia! Klik untuk melihat rilis"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
          <span>Update v{{ latestVersionAvailable }}</span>
        </button>

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
        :has-update-available="hasUpdateAvailable"
        @new-session="handleOpenNewSession"
        @edit-session="handleOpenEditSession"
        @open-sync="isSyncOpen = true"
        @open-keys="handleOpenKeyManager"
        @open-change-password="isChangePasswordOpen = true"
        @open-update="isUpdateOpen = true"
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
              @mousedown.middle.prevent="handleCloseTab(tab)"
              @contextmenu.prevent="openTabContextMenu($event, tab)"
              :class="[
                'group flex items-center space-x-2 px-3 py-1.5 border-r border-boba-800 text-xs cursor-pointer font-mono transition h-full select-none',
                sessionStore.activeTabId === tab.id
                  ? ['bg-boba-950 text-slate-100 border-t-2 shadow-sm', getTabBadge(tab).activeBorder]
                  : 'bg-boba-900 text-slate-400 hover:bg-boba-850 hover:text-slate-200 border-t-2 border-t-transparent'
              ]"
            >
              <!-- Tab Type Icon -->
              <Icon :icon="getTabIcon(tab)" class="w-3.5 h-3.5 shrink-0" />

              <!-- Tab Category Badge (Distinct for SSH, DB, SFTP, FILE) -->
              <span
                :class="[
                  'text-[9px] px-1 py-0.2 rounded font-mono font-bold border shrink-0',
                  getTabBadge(tab).color
                ]"
              >
                {{ getTabBadge(tab).label }}
              </span>

              <!-- Live Connected Dot (for SSH) -->
              <span
                v-if="tab.type === 'terminal'"
                :class="['w-1.5 h-1.5 rounded-full shrink-0', tab.connected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-amber-400 animate-pulse']"
                :title="tab.connected ? 'Connected' : 'Connecting/Disconnected'"
              ></span>

              <span class="truncate max-w-[130px]" :title="tab.title">{{ tab.title }}</span>

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
                  v-if="tab.type === 'terminal'"
                  @click.stop="sessionStore.duplicateTab(tab.id)"
                  title="Duplicate Tab (Open second SSH session)"
                  class="opacity-0 group-hover:opacity-100 hover:text-sky-400 text-[11px] p-0.5 rounded hover:bg-boba-800 transition"
                >
                  <Icon icon="lucide:copy" class="w-3 h-3" />
                </button>

                <!-- Close Tab Button -->
                <button
                  @click.stop="handleCloseTab(tab)"
                  :title="tab.type === 'dbms' ? 'Close DBMS Tab (Ctrl+Shift+W atau Klik Tengah)' : 'Close Tab (Ctrl+W atau Klik Tengah)'"
                  :class="[
                    'text-[10px] p-0.5 rounded transition',
                    sessionStore.activeTabId === tab.id
                      ? 'opacity-100 text-slate-400 hover:text-rose-400 hover:bg-boba-800'
                      : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 hover:bg-boba-800'
                  ]"
                >
                  <Icon icon="lucide:x" class="w-3 h-3" />
                </button>
              </div>
            </div>

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

          <!-- AI Copilot Button -->
          <button
            @click="aiAgentStore.toggleDrawer()"
            :class="[
              'px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1.5 transition ml-2 border shrink-0',
              aiAgentStore.isDrawerOpen
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400/60 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                : 'bg-boba-950 border-purple-900/50 text-purple-300 hover:text-white hover:border-purple-500'
            ]"
            title="Buka / Tutup AI Copilot (Ctrl+Shift+A)"
          >
            <span class="text-sm">✨</span>
            <span>AI Copilot</span>
          </button>
        </div>

        <!-- Workspace and AI Assistant Drawer Container -->
        <div class="flex-1 flex overflow-hidden">
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
                <!-- Render Editor Tab, SFTP Manager Tab, DBMS Tab, or Terminal Tab -->
                <div class="flex-1 h-full overflow-hidden">
                  <EditorTab v-if="tab.type === 'editor'" :tab="tab" />
                  <SftpManagerTab v-else-if="tab.type === 'sftp'" :tab="tab" />
                  <DbmsTab v-else-if="tab.type === 'dbms'" :tab="tab" />
                  <TerminalTab v-else :tab="tab" />
                </div>

                <!-- Terminal SFTP Drawer -->
                <div v-if="tab.type === 'terminal' && tab.sftpOpen" class="h-full">
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

          <!-- AI Assistant Drawer Component -->
          <AiAssistantDrawer />
        </div>
      </main>
    </div>

    <!-- Modals & Overlays -->
    <DbConnectionModal
      :is-open="dbmsStore.isModalOpen"
      :db-config="dbmsStore.editingDbConfig"
      @close="dbmsStore.isModalOpen = false"
    />
    <UpdateModal :is-open="isUpdateOpen" @close="isUpdateOpen = false" />
    <SyncModal :is-open="isSyncOpen" @close="isSyncOpen = false" />
    <KeyManagerModal :is-open="isKeyManagerOpen" @close="isKeyManagerOpen = false" />
    <ChangeMasterPasswordModal :is-open="isChangePasswordOpen" @close="isChangePasswordOpen = false" />
    <NewSessionModal
      :is-open="isNewSessionOpen"
      :session-to-edit="sessionEditing"
      :folder-id="activeFolderId"
      @close="isNewSessionOpen = false"
    />
    <VaultLockModal />
    <AppDialog />
    <AiProviderModal />

    <!-- Tab Context Menu Floating Overlay -->
    <div
      v-if="tabContextMenu.visible && tabContextMenu.tab"
      :style="{ top: `${tabContextMenu.y}px`, left: `${tabContextMenu.x}px` }"
      class="fixed z-[99999] bg-[#161a26] border border-[#2b354b] shadow-2xl rounded py-1 w-44 text-[11px] text-slate-200 select-none font-mono"
      @click.stop
    >
      <div class="px-2.5 py-1 text-[10px] text-slate-400 font-semibold truncate border-b border-[#232b3d] mb-0.5">
        {{ tabContextMenu.tab.title }}
      </div>
      <button
        v-if="tabContextMenu.tab.type === 'terminal'"
        @click="duplicateContextTab"
        class="w-full text-left px-2.5 py-1 hover:bg-[#232b3d] hover:text-white flex items-center space-x-2 transition"
      >
        <span>⧉</span>
        <span>Duplikat Tab</span>
      </button>
      <button
        @click="closeContextTab"
        class="w-full text-left px-2.5 py-1 hover:bg-rose-950/60 hover:text-rose-300 flex items-center space-x-2 text-rose-400 transition"
      >
        <span>✕</span>
        <span>Tutup Tab</span>
      </button>
      <button
        v-if="sessionStore.tabs.length > 1"
        @click="closeOtherContextTabs"
        class="w-full text-left px-2.5 py-1 hover:bg-[#232b3d] hover:text-white flex items-center space-x-2 transition border-t border-[#232b3d]/60 mt-0.5"
      >
        <span>🚫</span>
        <span>Tutup Tab Lainnya</span>
      </button>
    </div>

    <!-- Error Overlay Boundary -->
    <div
      v-if="appError"
      class="fixed inset-4 z-[999999] bg-rose-950/95 border-2 border-rose-500 rounded-xl p-6 shadow-2xl flex flex-col space-y-4 text-white font-mono overflow-auto select-text backdrop-blur-md"
    >
      <div class="flex items-center justify-between border-b border-rose-800 pb-3">
        <h2 class="text-base font-bold text-rose-200 flex items-center space-x-2">
          <span>⚠️</span>
          <span>Komponen Mengalami Error:</span>
        </h2>
        <button
          @click="appError = null"
          class="px-3 py-1 bg-rose-800 hover:bg-rose-700 rounded text-xs text-white transition"
        >
          Tutup Error
        </button>
      </div>
      <div class="text-sm font-bold text-rose-100">{{ appError.message }}</div>
      <div v-if="appError.info" class="text-xs text-rose-300">Lokasi: {{ appError.info }}</div>
      <pre class="flex-1 bg-black/60 p-4 rounded-lg text-xs text-rose-200 overflow-auto whitespace-pre-wrap font-mono">{{ appError.stack }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, onErrorCaptured } from 'vue';
import { Icon } from '@iconify/vue';
import Sidebar from './components/Sidebar.vue';
import TerminalTab from './components/TerminalTab.vue';
import EditorTab from './components/EditorTab.vue';
import SftpManagerTab from './components/SftpManagerTab.vue';
import DbmsTab from './components/DbmsTab.vue';
import SftpDrawer from './components/SftpDrawer.vue';
import VaultLockModal from './components/VaultLockModal.vue';
import SyncModal from './components/SyncModal.vue';
import KeyManagerModal from './components/KeyManagerModal.vue';
import ChangeMasterPasswordModal from './components/ChangeMasterPasswordModal.vue';
import NewSessionModal from './components/NewSessionModal.vue';
import AppDialog from './components/AppDialog.vue';
import AiAssistantDrawer from './components/AiAssistantDrawer.vue';
import AiProviderModal from './components/AiProviderModal.vue';
import UpdateModal from './components/UpdateModal.vue';
import DbConnectionModal from './components/DbConnectionModal.vue';

import { useVaultStore } from './stores/vaultStore.js';
import { useSyncStore } from './stores/syncStore.js';
import { useSessionStore } from './stores/sessionStore.js';
import { useDialogStore } from './stores/dialogStore.js';
import { useTransferQueueStore } from './stores/transferQueueStore.js';
import { useAiAgentStore } from './stores/aiAgentStore.js';
import { useDbmsStore } from './stores/dbmsStore.js';
import { tauriBridge } from './services/tauriBridge.js';
import type { SshSessionConfig, ActiveTab } from './types/index.js';

const vaultStore = useVaultStore();
const syncStore = useSyncStore();
const sessionStore = useSessionStore();
const dialogStore = useDialogStore();
const queueStore = useTransferQueueStore();
const aiAgentStore = useAiAgentStore();
const dbmsStore = useDbmsStore();

function getTabBadge(tab: ActiveTab) {
  if (tab.type === 'terminal') {
    return {
      label: 'SSH',
      color: 'bg-emerald-950/90 text-emerald-400 border-emerald-700/60',
      activeBorder: 'border-t-emerald-500'
    };
  }
  if (tab.type === 'dbms') {
    const engine = tab.dbConnection?.engine?.toUpperCase() || 'DB';
    return {
      label: engine,
      color: 'bg-indigo-950/90 text-indigo-300 border-indigo-700/60',
      activeBorder: 'border-t-indigo-500'
    };
  }
  if (tab.type === 'sftp') {
    return {
      label: 'SFTP',
      color: 'bg-sky-950/90 text-sky-300 border-sky-700/60',
      activeBorder: 'border-t-sky-500'
    };
  }
  if (tab.type === 'editor') {
    return {
      label: 'FILE',
      color: 'bg-amber-950/90 text-amber-300 border-amber-700/60',
      activeBorder: 'border-t-amber-500'
    };
  }
  return {
    label: 'TAB',
    color: 'bg-slate-800 text-slate-300 border-slate-700',
    activeBorder: 'border-t-sky-500'
  };
}

function getTabIcon(tab: ActiveTab): string {
  if (tab.type === 'terminal') return 'lucide:terminal';
  if (tab.type === 'sftp') return 'lucide:folder-sync';
  if (tab.type === 'editor') return 'lucide:file-code';
  if (tab.type === 'dbms') {
    switch (tab.dbConnection?.engine?.toLowerCase()) {
      case 'mysql':
      case 'mariadb':
        return 'logos:mysql';
      case 'postgres':
      case 'postgresql':
        return 'logos:postgresql';
      case 'sqlite':
        return 'logos:sqlite';
      case 'redis':
        return 'logos:redis';
      case 'mongodb':
        return 'logos:mongodb-icon';
      default:
        return 'lucide:database';
    }
  }
  return 'lucide:terminal';
}

const isUpdateOpen = ref(false);
const hasUpdateAvailable = ref(false);
const latestVersionAvailable = ref('');
const isSyncOpen = ref(false);
const isKeyManagerOpen = ref(false);
const isChangePasswordOpen = ref(false);
const isNewSessionOpen = ref(false);
const sessionEditing = ref<SshSessionConfig | null>(null);
const activeFolderId = ref<string | null>(null);
const appError = ref<{ message: string; stack?: string; info?: string } | null>(null);

const tabContextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  tab: ActiveTab | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  tab: null,
});

function openTabContextMenu(e: MouseEvent, tab: ActiveTab) {
  e.preventDefault();
  tabContextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 180),
    y: e.clientY + 4,
    tab,
  };
}

function closeTabContextMenu() {
  tabContextMenu.value.visible = false;
  tabContextMenu.value.tab = null;
}

function duplicateContextTab() {
  if (tabContextMenu.value.tab) {
    sessionStore.duplicateTab(tabContextMenu.value.tab.id);
  }
  closeTabContextMenu();
}

function closeContextTab() {
  if (tabContextMenu.value.tab) {
    handleCloseTab(tabContextMenu.value.tab);
  }
  closeTabContextMenu();
}

async function closeOtherContextTabs() {
  if (tabContextMenu.value.tab) {
    const targetTab = tabContextMenu.value.tab;
    closeTabContextMenu();
    if (queueStore.hasActiveTransfers) {
      const confirm = await dialogStore.confirm({
        title: 'Tutup Tab Lainnya?',
        description: 'Ada transfer yang mungkin sedang berjalan di tab lain. Menutup tab lain akan membatalkan transfer tersebut. Lanjutkan?',
        confirmText: 'Tutup Tab Lain',
        isDestructive: true,
      });
      if (!confirm) return;
      queueStore.cancelAll();
    }
    sessionStore.closeOtherTabs(targetTab.id);
  }
}

onErrorCaptured((err, instance, info) => {
  console.error('[CRITICAL APP ERROR]', err, info);
  appError.value = {
    message: String((err as any)?.message || err),
    stack: String((err as any)?.stack || ''),
    info: String(info || ''),
  };
  return false;
});

async function handleOpenKeyManager() {
  const enteredPassword = await dialogStore.prompt({
    title: 'Verifikasi Master Password',
    description: 'SSH Key Vault menyimpan private key terenkripsi. Masukkan Master Password untuk membuka akses:',
    placeholder: 'Ketik Master Password...',
    confirmText: 'Buka Key Vault',
    inputType: 'password',
  });

  if (!enteredPassword) return;

  if (enteredPassword === vaultStore.masterPassword) {
    isKeyManagerOpen.value = true;
  } else {
    await dialogStore.alert({
      title: 'Akses Ditolak',
      description: 'Master Password salah. Akses ke SSH Key Vault tidak diizinkan.',
      variant: 'error',
    });
  }
}

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
  } else if (tab.type === 'sftp' && queueStore.hasActiveTransfers) {
    const confirm = await dialogStore.confirm({
      title: 'Batalkan Transfer & Tutup Tab?',
      description: `Masih ada transfer aktif (${queueStore.activeTransfers.length} aktif, ${queueStore.pendingTransfers.length} antrean). Menutup tab ini akan membatalkan semua transfer yang sedang berjalan. Yakin ingin menutup?`,
      confirmText: 'Tutup & Batalkan',
      isDestructive: true,
    });
    if (!confirm) return;
    queueStore.cancelAll();
  }
  sessionStore.closeTab(tab.id);
}

function handleKeyDown(e: KeyboardEvent) {
  // Ctrl+Shift+A: Toggle AI Server Copilot Drawer
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
    e.preventDefault();
    aiAgentStore.toggleDrawer();
    return;
  }

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
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T' || e.key === 'n' || e.key === 'N')) {
    if (sessionStore.activeTabId) {
      const curTab = sessionStore.tabs.find(t => t.id === sessionStore.activeTabId);
      if (curTab && curTab.type === 'dbms') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('boba:dbms-new-subtab', { detail: { tabId: curTab.id } }));
      }
    }
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
    if (!isSyncOpen.value && !isKeyManagerOpen.value && !isNewSessionOpen.value) {
      if (sessionStore.activeTabId) {
        e.preventDefault();
        const curTab = sessionStore.tabs.find(t => t.id === sessionStore.activeTabId);
        if (curTab) {
          if (e.shiftKey) {
            // Ctrl+Shift+W: Selalu menutup tab sesi utama teratas (termasuk sesi DBMS)
            handleCloseTab(curTab);
          } else if (curTab.type === 'dbms') {
            // Ctrl+W di DBMS: Menutup sub-tab query SQL yang sedang aktif di DBMS
            window.dispatchEvent(new CustomEvent('boba:dbms-close-subtab', { detail: { tabId: curTab.id } }));
          } else {
            // Ctrl+W di luar DBMS (SSH, SFTP, File): Menutup tab sesi utama
            handleCloseTab(curTab);
          }
        }
      }
    }
  }
}

async function checkUpdateSilently() {
  const autoCheck = localStorage.getItem('boba_auto_check_update');
  if (autoCheck === 'false') return;

  try {
    const info = await tauriBridge.checkAppUpdate();
    if (info && info.has_update) {
      hasUpdateAvailable.value = true;
      latestVersionAvailable.value = info.latest_version;
    }
  } catch (e) {
    // Silent fail on background check
    console.debug('Background update check failed:', e);
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, { capture: true });
  window.addEventListener('click', closeTabContextMenu);
  queueStore.initListener();
  checkUpdateSilently();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, { capture: true });
  window.removeEventListener('click', closeTabContextMenu);
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
