<template>
  <aside
    class="w-72 bg-boba-900 border-r border-boba-800 flex flex-col h-full select-none relative"
    @click="closeContextMenu"
  >
    <!-- Brand / Header -->
    <div class="px-4 py-3 border-b border-boba-800 flex items-center justify-between">
      <div class="flex items-center space-x-2.5">
        <img src="/logo.png" alt="BOBA" class="w-7 h-7 rounded-lg shadow-md object-contain border border-sky-500/30" />
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

        <!-- Change Master Password Button -->
        <button
          @click="$emit('open-change-password')"
          title="Ubah Master Password (E2EE)"
          class="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-boba-800 rounded-md transition text-xs"
        >
          🛡️
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
      <div class="flex items-center space-x-1.5">
        <button
          @click="sessionStore.openSftpTab()"
          title="Buka SFTP Manager Dedicated (Dual Pane / Inter-Session)"
          class="px-2 py-1 bg-sky-950/80 hover:bg-sky-800 text-sky-300 hover:text-white rounded text-[11px] font-medium border border-sky-700/50 transition flex items-center space-x-1"
        >
          <span>⚡</span>
          <span>SFTP</span>
        </button>
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

    <!-- Session Hierarchy Tree (Supports Drag and Drop) -->
    <div
      ref="treeContainer"
      class="flex-1 overflow-y-auto p-2.5 space-y-1 text-xs font-sans"
      data-unorg-zone
    >
      <div v-if="filteredFolders.length === 0 && unorganizedSessions.length === 0" class="p-6 text-center text-slate-500">
        No sessions found. Click "+ Session" to add.
      </div>

      <!-- Folders -->
      <div
        v-for="folder in filteredFolders"
        :key="folder.id"
        data-folder-wrap
        :data-folder-id="folder.id"
        class="space-y-0.5 rounded-lg transition-all relative"
        :class="[
          dragType === 'session' && dragOverFolderId === folder.id ? 'bg-sky-950/50 ring-2 ring-sky-500' : '',
          dragType === 'folder' && dragOverFolderTargetId === folder.id && dragOverFolderPos === 'top' ? 'border-t-2 border-sky-400' : '',
          dragType === 'folder' && dragOverFolderTargetId === folder.id && dragOverFolderPos === 'bottom' ? 'border-b-2 border-sky-400' : '',
          draggingFolderId === folder.id ? 'opacity-30' : ''
        ]"
        @contextmenu.prevent="openFolderContextMenu($event, folder)"
      >
        <!-- Folder Row -->
        <div
          data-folder-row
          :data-folder-id="folder.id"
          @mousedown="beginPointerDrag('folder', folder, $event)"
          @click="toggleFolder(folder.id)"
          class="flex items-center justify-between px-2.5 py-1.5 hover:bg-boba-800/70 rounded-lg group cursor-pointer select-none transition"
          :class="[dragGhost?.type === 'folder' && dragGhost.id === folder.id ? 'opacity-30' : '']"
        >
          <div class="flex items-center space-x-2 truncate mr-2 pointer-events-none">
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
            Empty folder (drop session here)
          </div>

          <div
            v-for="session in getSessionsInFolder(folder.id)"
            :key="session.id"
            data-sess-row
            :data-session-id="session.id"
            @mousedown="beginPointerDrag('session', session, $event)"
            @dblclick="sessionStore.openSession(session, true)"
            @contextmenu.prevent="openSessionContextMenu($event, session)"
            class="flex items-center justify-between px-2.5 py-1.5 hover:bg-boba-800/80 rounded-md cursor-grab active:cursor-grabbing group transition select-none"
            :class="[
              dragGhost?.type === 'session' && dragGhost.id === session.id ? 'opacity-30' : '',
              dragType === 'session' && dragOverSessionId === session.id && dragOverSessionPos === 'top' ? 'border-t-2 border-sky-400' : '',
              dragType === 'session' && dragOverSessionId === session.id && dragOverSessionPos === 'bottom' ? 'border-b-2 border-sky-400' : ''
            ]"
            title="Drag to move or reorder, double click to connect"
          >
            <div class="flex items-center space-x-2 truncate mr-2 pointer-events-none">
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

      <!-- Root / Unorganized Sessions (Drop Target to remove from folder) -->
      <div
        v-if="unorganizedSessions.length > 0"
        data-unorg
        class="pt-1.5 space-y-0.5 rounded-lg"
        :class="[dragType === 'session' && dragOverRoot ? 'bg-sky-950/30 ring-1 ring-sky-500/50' : '']"
      >
        <div
          v-for="session in unorganizedSessions"
          :key="session.id"
          data-sess-row
          :data-session-id="session.id"
          @mousedown="beginPointerDrag('session', session, $event)"
          @dblclick="sessionStore.openSession(session, true)"
          @contextmenu.prevent="openSessionContextMenu($event, session)"
          class="flex items-center justify-between px-2.5 py-1.5 hover:bg-boba-800/80 rounded-lg cursor-grab active:cursor-grabbing group transition select-none"
          :class="[
            dragGhost?.type === 'session' && dragGhost.id === session.id ? 'opacity-30' : '',
            dragType === 'session' && dragOverSessionId === session.id && dragOverSessionPos === 'top' ? 'border-t-2 border-sky-400' : '',
            dragType === 'session' && dragOverSessionId === session.id && dragOverSessionPos === 'bottom' ? 'border-b-2 border-sky-400' : ''
          ]"
          title="Drag to move or reorder, double click to connect"
        >
          <div class="flex items-center space-x-2.5 truncate mr-2 pointer-events-none">
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

    <!-- Drag Ghost Indicator -->
    <div
      v-if="dragGhost"
      class="pointer-events-none fixed z-[10000] flex items-center space-x-2 bg-[#1b2230] border border-sky-500/70 shadow-2xl rounded-md px-3 py-1.5 text-xs font-mono text-slate-100"
      :style="{ left: `${dragGhost.x}px`, top: `${dragGhost.y}px`, transform: 'translate(-50%, -130%)' }"
    >
      <span>{{ dragGhost.type === 'folder' ? '📁' : '>' }}</span>
      <span class="truncate max-w-[200px]">{{ dragGhost.label }}</span>
    </div>

    <!-- Custom Session Context Menu -->
    <div
      v-if="contextMenu.show"
      class="fixed z-[9999] bg-[#141721] border border-[#2e3748] rounded-lg shadow-2xl p-1 w-52 text-xs font-sans text-slate-200 select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <!-- Session Menu Items -->
      <template v-if="contextMenu.type === 'session' && contextMenu.session">
        <button
          @click="handleContextConnect(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <span>🚀</span>
          <span>Connect Terminal</span>
        </button>

        <button
          @click="handleContextOpenSftp(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <span>📁</span>
          <span>Open SFTP Manager</span>
        </button>

        <button
          @click="handleContextCut(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <span>✂️</span>
          <span>Cut (Move)</span>
        </button>

        <button
          @click="handleContextCopy(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <span>📋</span>
          <span>Copy (Duplicate)</span>
        </button>

        <div class="h-px bg-[#232936] my-1"></div>

        <button
          @click="handleContextEdit(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <span>✎</span>
          <span>Edit Session</span>
        </button>

        <button
          @click="handleContextDelete(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-rose-600 hover:text-white text-rose-300 transition"
        >
          <span>🗑️</span>
          <span>Delete Session</span>
        </button>
      </template>

      <!-- Folder Menu Items -->
      <template v-else-if="contextMenu.type === 'folder' && contextMenu.folder">
        <button
          v-if="clipboardSession"
          @click="handleContextPasteToFolder(contextMenu.folder.id)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded bg-sky-950/60 hover:bg-sky-600 hover:text-white text-sky-300 transition font-semibold"
        >
          <span>📥</span>
          <span>Paste Session Here ({{ clipboardSession.session.name || clipboardSession.session.host }})</span>
        </button>

        <button
          @click="handleContextNewSessionInFolder(contextMenu.folder.id)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <span>➕</span>
          <span>New Session Here</span>
        </button>

        <button
          @click="handleContextRenameFolder(contextMenu.folder)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <span>🏷️</span>
          <span>Rename Folder</span>
        </button>

        <div class="h-px bg-[#232936] my-1"></div>

        <button
          @click="handleContextDeleteFolder(contextMenu.folder)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-rose-600 hover:text-white text-rose-300 transition"
        >
          <span>🗑️</span>
          <span>Delete Folder</span>
        </button>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useVaultStore } from '../stores/vaultStore.js';
import { useSyncStore } from '../stores/syncStore.js';
import { useSessionStore } from '../stores/sessionStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import type { SshSessionConfig, Folder } from '../types/index.js';

const emit = defineEmits(['new-session', 'edit-session', 'open-sync', 'open-keys', 'open-change-password']);

const vaultStore = useVaultStore();
const syncStore = useSyncStore();
const sessionStore = useSessionStore();
const dialogStore = useDialogStore();

const searchQuery = ref('');
const collapsedFolders = ref<Record<string, boolean>>({});

// Drag and Drop States (Pointer-based, works reliably in WebView2)
const treeContainer = ref<HTMLElement | null>(null);
const dragType = ref<'session' | 'folder' | null>(null);
const draggingSessionId = ref<string | null>(null);
const draggingFolderId = ref<string | null>(null);

const dragOverFolderId = ref<string | null>(null);
const dragOverFolderTargetId = ref<string | null>(null);
const dragOverFolderPos = ref<'top' | 'bottom' | null>(null);

const dragOverSessionId = ref<string | null>(null);
const dragOverSessionPos = ref<'top' | 'bottom' | null>(null);
const dragOverRoot = ref(false);

const dragGhost = ref<{
  type: 'session' | 'folder';
  id: string;
  label: string;
  x: number;
  y: number;
} | null>(null);

let pointerDragStart: { type: 'session' | 'folder'; id: string; label: string; x: number; y: number } | null = null;
let dragPointerMoved = false;

// Clipboard State for Cut/Copy/Paste
const clipboardSession = ref<{
  session: SshSessionConfig;
  mode: 'cut' | 'copy';
} | null>(null);

// Context Menu State
const contextMenu = ref<{
  show: boolean;
  type: 'session' | 'folder' | null;
  x: number;
  y: number;
  session?: SshSessionConfig;
  folder?: Folder;
}>({
  show: false,
  type: null,
  x: 0,
  y: 0,
});

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

// ---- Pointer-based Drag & Drop ----

function beginPointerDrag(type: 'session' | 'folder', item: any, e: MouseEvent) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement).closest('button')) return;

  pointerDragStart = {
    type,
    id: item.id,
    label: type === 'folder' ? item.name : (item.name || item.host || 'Session'),
    x: e.clientX,
    y: e.clientY,
  };
  dragPointerMoved = false;

  window.addEventListener('mousemove', onPointerDragMove);
  window.addEventListener('mouseup', onPointerDragEnd);
}

function onPointerDragMove(e: MouseEvent) {
  if (!pointerDragStart) return;

  // Activate drag after a small movement threshold
  if (!dragType.value) {
    const dx = e.clientX - pointerDragStart.x;
    const dy = e.clientY - pointerDragStart.y;
    if (Math.hypot(dx, dy) < 4) return;
    dragType.value = pointerDragStart.type;
    draggingSessionId.value = pointerDragStart.type === 'session' ? pointerDragStart.id : null;
    draggingFolderId.value = pointerDragStart.type === 'folder' ? pointerDragStart.id : null;
    dragGhost.value = { ...pointerDragStart, x: e.clientX, y: e.clientY };
    document.body.style.cursor = 'grabbing';
    dragPointerMoved = true;
  }

  if (!dragType.value) return;
  e.preventDefault();

  // Position ghost near cursor
  if (dragGhost.value) {
    dragGhost.value.x = e.clientX;
    dragGhost.value.y = e.clientY;
  }

  // Auto-scroll when near the edges of the scroll container
  const cont = treeContainer.value;
  if (cont) {
    const r = cont.getBoundingClientRect();
    if (e.clientY < r.top + 28) cont.scrollTop -= 12;
    else if (e.clientY > r.bottom - 28) cont.scrollTop += 12;
  }

  // Compute drop target from the element under the pointer
  computeDragTarget(e.clientX, e.clientY);
}

function computeDragTarget(clientX: number, clientY: number) {
  clearDropOverlays();
  if (!dragType.value) return;

  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  if (!el || !treeContainer.value || !treeContainer.value.contains(el)) return;

  // 1. Over a session row -> reorder session (session drag only)
  const sessRow = el.closest('[data-sess-row]') as HTMLElement | null;
  if (dragType.value === 'session' && sessRow) {
    const id = sessRow.getAttribute('data-session-id');
    if (id && id !== draggingSessionId.value) {
      dragOverSessionId.value = id;
      const rect = sessRow.getBoundingClientRect();
      dragOverSessionPos.value = clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    }
    return;
  }

  // 2. Over a folder area
  const folderWrap = el.closest('[data-folder-wrap]') as HTMLElement | null;
  if (folderWrap) {
    const fid = folderWrap.getAttribute('data-folder-id');
    if (!fid) return;

    if (dragType.value === 'session') {
      // Dragging a session onto a folder -> move into folder (unless already inside this folder body)
      const srcFolder = vaultStore.vault.sessions.find(s => s.id === draggingSessionId.value)?.folder_id ?? null;
      if (srcFolder !== fid) dragOverFolderId.value = fid;
    } else if (dragType.value === 'folder' && fid !== draggingFolderId.value) {
      // Dragging a folder over another folder -> reorder before/after it
      dragOverFolderTargetId.value = fid;
      const rowEl = el.closest('[data-folder-row]') as HTMLElement | null;
      const rect = (rowEl || folderWrap).getBoundingClientRect();
      dragOverFolderPos.value = clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    }
    return;
  }

  // 3. Anywhere else inside the tree -> root drop zone (unorganize sessions)
  if (dragType.value === 'session') {
    dragOverRoot.value = true;
  }
}

function clearDropOverlays() {
  dragOverFolderId.value = null;
  dragOverFolderTargetId.value = null;
  dragOverFolderPos.value = null;
  dragOverSessionId.value = null;
  dragOverSessionPos.value = null;
  dragOverRoot.value = false;
}

function onPointerDragEnd(e: MouseEvent) {
  if (!pointerDragStart) return;
  window.removeEventListener('mousemove', onPointerDragMove);
  window.removeEventListener('mouseup', onPointerDragEnd);

  if (dragType.value) {
    const type = dragType.value;
    const id = pointerDragStart.id;
    executeDrop(type, id);
  }

  // If never moved, treat as click (no-op). Toggle handled by @click on folder.
  pointerDragStart = null;
  dragType.value = null;
  draggingSessionId.value = null;
  draggingFolderId.value = null;
  dragGhost.value = null;
  clearDropOverlays();
  document.body.style.cursor = '';
}

async function executeDrop(type: 'session' | 'folder', id: string) {
  // Session dragged onto a session row -> reorder into that session's folder at pos
  if (type === 'session' && dragOverSessionId.value && dragOverSessionId.value !== id) {
    const targetSession = vaultStore.vault.sessions.find(s => s.id === dragOverSessionId.value);
    if (targetSession) {
      const sessions = [...vaultStore.vault.sessions];
      const srcIndex = sessions.findIndex(s => s.id === id);
      if (srcIndex >= 0) {
        const [moved] = sessions.splice(srcIndex, 1);
        moved.folder_id = targetSession.folder_id;
        collapsedFolders.value[targetSession.folder_id || ''] = false;
        const newTargetIndex = sessions.findIndex(s => s.id === targetSession.id);
        const insertIndex = dragOverSessionPos.value === 'top' ? newTargetIndex : newTargetIndex + 1;
        sessions.splice(insertIndex, 0, moved);
        vaultStore.vault.sessions = sessions;
        await vaultStore.persist(true);
      }
    }
    return;
  }

  // Session dragged onto a folder -> move into folder
  if (type === 'session' && dragOverFolderId.value) {
    const sessions = [...vaultStore.vault.sessions];
    const session = sessions.find(s => s.id === id);
    if (session && session.folder_id !== dragOverFolderId.value) {
      session.folder_id = dragOverFolderId.value;
      collapsedFolders.value[dragOverFolderId.value] = false;
      vaultStore.vault.sessions = sessions;
      await vaultStore.persist(true);
    }
    return;
  }

  // Session dropped on root empty zone -> unorganize
  if (type === 'session' && dragOverRoot.value) {
    const sessions = [...vaultStore.vault.sessions];
    const session = sessions.find(s => s.id === id);
    if (session && session.folder_id !== null) {
      session.folder_id = null;
      vaultStore.vault.sessions = sessions;
      await vaultStore.persist(true);
    }
    return;
  }

  // Folder dragged over another folder -> reorder
  if (type === 'folder' && dragOverFolderTargetId.value && dragOverFolderTargetId.value !== id) {
    const folders = [...vaultStore.vault.folders];
    const srcIndex = folders.findIndex(f => f.id === id);
    const tgtIndex = folders.findIndex(f => f.id === dragOverFolderTargetId.value);
    if (srcIndex >= 0 && tgtIndex >= 0) {
      const [moved] = folders.splice(srcIndex, 1);
      const newTargetIndex = folders.findIndex(f => f.id === dragOverFolderTargetId.value);
      const insertIndex = dragOverFolderPos.value === 'top' ? newTargetIndex : newTargetIndex + 1;
      folders.splice(insertIndex, 0, moved);
      vaultStore.vault.folders = folders;
      await vaultStore.persist(true);
    }
    return;
  }
}

// Context Menu Functions
function openSessionContextMenu(e: MouseEvent, session: SshSessionConfig) {
  let posX = e.clientX;
  let posY = e.clientY;
  if (posX + 210 > window.innerWidth) posX = window.innerWidth - 220;
  if (posY + 200 > window.innerHeight) posY = window.innerHeight - 210;

  contextMenu.value = {
    show: true,
    type: 'session',
    x: posX,
    y: posY,
    session,
  };
}

function openFolderContextMenu(e: MouseEvent, folder: Folder) {
  let posX = e.clientX;
  let posY = e.clientY;
  if (posX + 210 > window.innerWidth) posX = window.innerWidth - 220;
  if (posY + 180 > window.innerHeight) posY = window.innerHeight - 190;

  contextMenu.value = {
    show: true,
    type: 'folder',
    x: posX,
    y: posY,
    folder,
  };
}

function closeContextMenu() {
  contextMenu.value.show = false;
}

function handleContextConnect(session: SshSessionConfig) {
  closeContextMenu();
  sessionStore.openSession(session, true);
}

function handleContextOpenSftp(session: SshSessionConfig) {
  closeContextMenu();
  // Open terminal tab if not open, then open sftp tab
  sessionStore.openSession(session, false);
  const tab = sessionStore.tabs.find(t => t.sessionConfig.id === session.id);
  if (tab) {
    sessionStore.openSftpTab(tab);
  }
}

function handleContextCut(session: SshSessionConfig) {
  closeContextMenu();
  clipboardSession.value = {
    session,
    mode: 'cut',
  };
}

function handleContextCopy(session: SshSessionConfig) {
  closeContextMenu();
  clipboardSession.value = {
    session,
    mode: 'copy',
  };
}

function handleContextEdit(session: SshSessionConfig) {
  closeContextMenu();
  emit('edit-session', session);
}

function handleContextDelete(session: SshSessionConfig) {
  closeContextMenu();
  deleteSession(session);
}

function handleContextNewSessionInFolder(folderId: string) {
  closeContextMenu();
  emit('new-session', folderId);
}

async function handleContextRenameFolder(folder: Folder) {
  closeContextMenu();
  const newName = await dialogStore.prompt({
    title: `Rename Folder "${folder.name}"`,
    description: 'Enter new folder name.',
    defaultValue: folder.name,
    confirmText: 'Rename',
  });
  if (newName && newName.trim() && newName.trim() !== folder.name) {
    folder.name = newName.trim();
    await vaultStore.persist(true);
  }
}

function handleContextDeleteFolder(folder: Folder) {
  closeContextMenu();
  deleteFolder(folder);
}

async function handleContextPasteToFolder(targetFolderId: string | null) {
  closeContextMenu();
  if (!clipboardSession.value) return;

  const { session, mode } = clipboardSession.value;

  if (mode === 'cut') {
    // Move session
    const target = vaultStore.vault.sessions.find(s => s.id === session.id);
    if (target) {
      target.folder_id = targetFolderId;
      await vaultStore.persist(true);
    }
    clipboardSession.value = null;
  } else if (mode === 'copy') {
    // Duplicate session into target folder
    const newSession: SshSessionConfig = {
      ...JSON.parse(JSON.stringify(session)),
      id: `ses_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `${session.name || session.host} (Copy)`,
      folder_id: targetFolderId,
    };
    vaultStore.vault.sessions.push(newSession);
    await vaultStore.persist(true);
  }
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

onMounted(() => {
  window.addEventListener('click', closeContextMenu);
});

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu);
  window.removeEventListener('mousemove', onPointerDragMove);
  window.removeEventListener('mouseup', onPointerDragEnd);
  pointerDragStart = null;
  document.body.style.cursor = '';
});
</script>
