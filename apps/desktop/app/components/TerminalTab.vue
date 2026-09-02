<template>
  <div
    class="h-full w-full flex flex-col bg-[#0b0d13] overflow-hidden relative group"
    @click="focusThisTab"
  >
    <!-- Compact Terminal Quick Toolbar (Header) -->
    <div
      class="h-7 border-b flex items-center justify-between px-2.5 text-[11px] select-none shrink-0 transition-colors"
      :class="[
        sessionStore.activeTabId === tab.id
          ? 'bg-[#181d28] border-sky-500/50 text-slate-100'
          : 'bg-[#12141c] border-[#232936] text-slate-400'
      ]"
    >
      <div class="flex items-center space-x-2 truncate">
        <span
          :class="['w-1.5 h-1.5 rounded-full shrink-0', tab.connected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : isReconnecting ? 'bg-amber-400 animate-ping' : 'bg-rose-500']"
        ></span>
        <span class="font-mono font-semibold truncate" :class="{ 'text-sky-300': sessionStore.activeTabId === tab.id }">
          {{ tab.title }}
        </span>
        <span v-if="tab.error" class="text-rose-400 truncate text-[10px]">({{ tab.error }})</span>
        <span v-else-if="isReconnecting" class="text-amber-400 font-mono text-[10px] animate-pulse">
          Auto-reconnecting in {{ reconnectCountdown }}s...
        </span>
      </div>

      <div class="flex items-center space-x-1 shrink-0">
        <!-- Quick Commands Toggle -->
        <button
          @click.stop="showCommandsBar = !showCommandsBar"
          :class="['px-2 py-0.5 rounded text-[10px] font-medium transition flex items-center space-x-1', showCommandsBar ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-[#1a1e29] text-slate-400 hover:text-slate-200']"
          title="Quick Commands"
        >
          <span>⚡</span>
          <span>Commands ({{ allSnippets.length }})</span>
        </button>

        <!-- Cancel Auto Reconnect Button -->
        <button
          v-if="isReconnecting"
          @click.stop="cancelAutoReconnect"
          class="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded text-[10px] font-medium transition"
          title="Cancel auto reconnect"
        >
          Cancel Auto-Retry
        </button>

        <!-- Manual Reconnect -->
        <button
          v-else
          @click.stop="reconnect"
          class="px-2 py-0.5 bg-[#1a1e29] hover:bg-[#232936] text-slate-300 rounded text-[10px] font-medium transition flex items-center space-x-1"
          title="Reconnect SSH"
        >
          <span>🔄</span>
          <span>Reconnect</span>
        </button>

        <!-- SFTP Toggle -->
        <button
          @click.stop="sessionStore.toggleSftp(tab.id)"
          :class="['px-2 py-0.5 rounded text-[10px] font-medium transition flex items-center space-x-1', tab.sftpOpen ? 'bg-sky-600 text-white shadow-sm' : 'bg-[#1a1e29] text-slate-400 hover:text-slate-200']"
          title="Toggle SFTP Explorer"
        >
          <span>📁</span>
          <span>SFTP</span>
        </button>
      </div>
    </div>

    <!-- Quick Commands Horizontal Chips Bar -->
    <div
      v-if="showCommandsBar"
      class="h-8 bg-[#161922] border-b border-[#232936] flex items-center px-2 space-x-1.5 overflow-x-auto no-scrollbar shrink-0 text-xs"
    >
      <span class="text-[10px] font-semibold text-amber-400 flex items-center space-x-1 uppercase shrink-0">
        <span>⚡</span>
        <span>Run:</span>
      </span>

      <!-- Empty state if no snippets -->
      <span v-if="allSnippets.length === 0" class="text-[11px] text-slate-500 italic">
        No quick commands yet.
      </span>

      <!-- Snippet Buttons -->
      <div
        v-for="snp in allSnippets"
        :key="snp.id"
        class="group/snp flex items-center bg-[#232936] hover:bg-[#2e3748] rounded text-[11px] font-mono transition shrink-0 border border-[#2e3748] overflow-hidden"
      >
        <button
          @click.stop="executeSnippet(snp)"
          :title="`${snp.description ? snp.description + '\n' : ''}${snp.command}`"
          class="px-2.5 py-0.5 text-slate-200 hover:text-sky-300 hover:bg-sky-950/40 transition"
        >
          {{ snp.title }}
        </button>

        <!-- Edit Button -->
        <button
          @click.stop="openEditModal(snp)"
          class="px-1 py-0.5 text-slate-400 hover:text-amber-300 hover:bg-amber-950/60 transition text-[10px]"
          title="Edit this quick command"
        >
          ✏️
        </button>

        <!-- Delete Button -->
        <button
          @click.stop="deleteSnippet(snp)"
          class="px-1.5 py-0.5 text-slate-500 hover:text-rose-300 hover:bg-rose-950/60 transition text-[9px]"
          title="Delete this quick command"
        >
          ✕
        </button>
      </div>

      <!-- Add New Custom Command for this session -->
      <button
        @click.stop="openAddModal"
        class="px-2 py-0.5 bg-boba-800 hover:bg-boba-700 text-slate-300 hover:text-white rounded text-[11px] transition shrink-0 font-medium"
        title="Add new quick command"
      >
        + Add Command
      </button>
    </div>

    <!-- Xterm Terminal Canvas Container -->
    <div
      ref="terminalRef"
      class="flex-1 w-full h-full p-1 bg-[#0b0d13] overflow-hidden"
      @contextmenu.prevent="openContextMenu"
    ></div>

    <!-- Custom Sleek Dark Terminal Context Menu -->
    <div
      v-if="contextMenu.show"
      ref="contextMenuRef"
      class="fixed z-[999] bg-[#141721] border border-[#2e3748] rounded-lg shadow-2xl p-1 w-52 text-xs font-sans text-slate-200 select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <!-- Copy -->
      <button
        @click="handleCopy"
        :disabled="!hasTextSelected"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
      >
        <div class="flex items-center space-x-2">
          <span class="text-xs">📋</span>
          <span>Copy</span>
        </div>
        <span class="text-[10px] font-mono opacity-60">Ctrl+C</span>
      </button>

      <!-- Paste -->
      <button
        @click="handlePaste"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
      >
        <div class="flex items-center space-x-2">
          <span class="text-xs">📥</span>
          <span>Paste</span>
        </div>
        <span class="text-[10px] font-mono opacity-60">Ctrl+V</span>
      </button>

      <!-- Select All -->
      <button
        @click="handleSelectAll"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
      >
        <div class="flex items-center space-x-2">
          <span class="text-xs">🔲</span>
          <span>Select All</span>
        </div>
        <span class="text-[10px] font-mono opacity-60">Ctrl+A</span>
      </button>

      <div class="h-px bg-[#232936] my-1"></div>

      <!-- Clear Screen -->
      <button
        @click="handleClearScreen"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
      >
        <div class="flex items-center space-x-1.5">
          <span class="text-xs">🧹</span>
          <span>Clear Screen</span>
        </div>
        <span class="text-[10px] font-mono opacity-60">Ctrl+L</span>
      </button>

      <!-- Open SFTP -->
      <button
        @click="handleToggleSftp"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
      >
        <div class="flex items-center space-x-2">
          <span class="text-xs">📁</span>
          <span>{{ tab.sftpOpen ? 'Close SFTP' : 'Open SFTP' }}</span>
        </div>
      </button>

      <!-- Duplicate Tab -->
      <button
        @click="handleDuplicateTab"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
      >
        <div class="flex items-center space-x-2">
          <span class="text-xs">⧉</span>
          <span>Duplicate Session</span>
        </div>
      </button>

      <div class="h-px bg-[#232936] my-1"></div>

      <!-- Reconnect -->
      <button
        @click="handleReconnect"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
      >
        <div class="flex items-center space-x-2">
          <span class="text-xs">🔄</span>
          <span>Reconnect Session</span>
        </div>
      </button>
    </div>

    <!-- Individual Terminal Footer Resource Monitor (CPU, RAM, Disk, Uptime) -->
    <div
      v-if="tab.connected"
      class="h-6 bg-[#0e1017] border-t border-[#232936] px-2.5 flex items-center justify-between text-[10px] font-mono select-none text-slate-400 shrink-0"
    >
      <!-- Left: Host & Uptime -->
      <div class="flex items-center space-x-2 truncate">
        <span class="text-slate-300 font-semibold truncate">{{ tab.sessionConfig.username }}@{{ tab.sessionConfig.host }}:{{ tab.sessionConfig.port }}</span>
        <span v-if="metrics?.uptime" class="text-slate-500 truncate hidden sm:inline">
          ⏱️ {{ metrics.uptime }}
        </span>
      </div>

      <!-- Right: Gauges -->
      <div class="flex items-center space-x-2.5 shrink-0">
        <!-- CPU Gauge -->
        <div class="flex items-center space-x-1" title="CPU Usage">
          <span class="text-slate-500">CPU:</span>
          <span
            :class="[
              'font-semibold',
              (metrics?.cpu_usage || 0) > 80 ? 'text-rose-400' : (metrics?.cpu_usage || 0) > 50 ? 'text-amber-400' : 'text-emerald-400'
            ]"
          >
            {{ metrics ? `${metrics.cpu_usage}%` : '...' }}
          </span>
        </div>

        <!-- RAM Gauge -->
        <div class="flex items-center space-x-1" title="RAM Usage">
          <span class="text-slate-500">RAM:</span>
          <span
            :class="[
              'font-semibold',
              (metrics?.ram_percent || 0) > 85 ? 'text-rose-400' : (metrics?.ram_percent || 0) > 65 ? 'text-amber-400' : 'text-sky-400'
            ]"
          >
            <template v-if="metrics">
              {{ formatMb(metrics.ram_used_mb) }} / {{ formatMb(metrics.ram_total_mb) }} ({{ metrics.ram_percent }}%)
            </template>
            <template v-else>...</template>
          </span>
        </div>

        <!-- Disk Gauge -->
        <div class="flex items-center space-x-1" title="Root Disk Usage">
          <span class="text-slate-500">Disk:</span>
          <span
            :class="[
              'font-semibold',
              (metrics?.disk_percent || 0) > 85 ? 'text-rose-400' : (metrics?.disk_percent || 0) > 70 ? 'text-amber-400' : 'text-purple-400'
            ]"
          >
            <template v-if="metrics">
              {{ metrics.disk_used }} / {{ metrics.disk_total }} ({{ metrics.disk_percent }}%)
            </template>
            <template v-else>...</template>
          </span>
        </div>

        <!-- Refresh Stats -->
        <button
          @click.stop="fetchMetrics"
          :disabled="loadingMetrics"
          class="hover:text-sky-400 transition text-[10px] p-0.5 disabled:opacity-50"
          title="Refresh Metrics"
        >
          <span :class="{ 'animate-spin': loadingMetrics }">🔄</span>
        </button>
      </div>
    </div>

    <!-- Single Add/Edit Quick Command Modal (Teleported to Body) -->
    <Teleport to="body">
      <div
        v-if="isAddModalOpen"
        class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
        @click.stop
        @keydown.esc="isAddModalOpen = false"
      >
        <div
          class="bg-boba-900 border border-boba-700 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4"
          @click.stop
        >
          <div class="flex items-center justify-between border-b border-boba-800 pb-2.5">
            <h3 class="text-sm font-bold text-slate-100 flex items-center space-x-1.5">
              <span class="text-amber-400">{{ editingSnippetId ? '✏️' : '⚡' }}</span>
              <span>{{ editingSnippetId ? 'Edit Quick Command' : 'Add Quick Command' }}</span>
            </h3>
            <button @click="isAddModalOpen = false" class="text-slate-400 hover:text-slate-200 text-xs">✕</button>
          </div>

          <form @submit.prevent="saveCommand" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Command Title</label>
              <input
                ref="titleInputRef"
                v-model="newCmdTitle"
                type="text"
                placeholder="e.g. Restart Docker / Build App"
                required
                class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Bash Command</label>
              <textarea
                v-model="newCmdBody"
                placeholder="e.g. cd /var/www && npm run build"
                rows="3"
                required
                class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg p-2.5 font-mono text-xs text-sky-300 placeholder-slate-500 focus:outline-none leading-relaxed resize-none"
              ></textarea>
              <p class="text-[10px] text-slate-500 mt-1">Tip: Use <code class="text-slate-400 font-mono">&&</code> to run multiple commands sequentially.</p>
            </div>

            <div class="space-y-1.5 pt-1">
              <label class="block text-[11px] font-semibold text-slate-400">Save Target</label>
              <div class="flex space-x-4 text-xs">
                <label class="flex items-center space-x-2 cursor-pointer text-slate-300">
                  <input type="radio" value="session" v-model="saveScope" class="text-boba-accent focus:ring-0" />
                  <span>This Server Only</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer text-slate-300">
                  <input type="radio" value="global" v-model="saveScope" class="text-boba-accent focus:ring-0" />
                  <span>All Servers (Global)</span>
                </label>
              </div>
            </div>

            <div class="flex justify-end space-x-2 pt-3 border-t border-boba-800">
              <button
                type="button"
                @click="isAddModalOpen = false"
                class="px-3.5 py-1.5 border border-boba-700 hover:bg-boba-800 rounded-lg text-xs font-medium text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="px-4 py-1.5 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-lg text-xs font-medium transition shadow-md"
              >
                {{ editingSnippetId ? 'Update Command' : 'Save Command' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';

import { useVaultStore } from '../stores/vaultStore.js';
import { useSessionStore } from '../stores/sessionStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import { tauriBridge } from '../services/tauriBridge.js';
import type { ActiveTab, SnippetItem, ServerMetrics } from '../types/index.js';

const props = defineProps<{
  tab: ActiveTab;
}>();

const vaultStore = useVaultStore();
const sessionStore = useSessionStore();
const dialogStore = useDialogStore();
const terminalRef = ref<HTMLDivElement | null>(null);

const showCommandsBar = ref(true);
const isReconnecting = ref(false);
const reconnectCountdown = ref(3);
let reconnectTimer: any = null;
let isExplicitlyClosed = false;

// Resource Metrics
const metrics = ref<ServerMetrics | null>(null);
const loadingMetrics = ref(false);
let metricsInterval: any = null;

// Context Menu State
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
});
const hasTextSelected = ref(false);

function openContextMenu(e: MouseEvent) {
  focusThisTab();
  hasTextSelected.value = !!(term && term.hasSelection());
  
  // Calculate viewport boundaries
  const menuWidth = 210;
  const menuHeight = 240;
  let posX = e.clientX;
  let posY = e.clientY;

  if (posX + menuWidth > window.innerWidth) {
    posX = window.innerWidth - menuWidth - 10;
  }
  if (posY + menuHeight > window.innerHeight) {
    posY = window.innerHeight - menuHeight - 10;
  }

  contextMenu.value = {
    show: true,
    x: Math.max(10, posX),
    y: Math.max(10, posY),
  };
}

function closeContextMenu() {
  if (contextMenu.value.show) {
    contextMenu.value.show = false;
  }
}

function handleCopy() {
  closeContextMenu();
  if (term && term.hasSelection()) {
    const sel = term.getSelection();
    if (sel) {
      navigator.clipboard.writeText(sel);
    }
  }
}

async function handlePaste() {
  closeContextMenu();
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      tauriBridge.sshWrite(props.tab.id, text);
      if (term) term.focus();
    }
  } catch (err) {
    console.warn('Clipboard read failed', err);
  }
}

function handleSelectAll() {
  closeContextMenu();
  if (term) {
    term.selectAll();
    term.focus();
  }
}

function handleClearScreen() {
  closeContextMenu();
  if (term) {
    term.clear();
    term.focus();
  }
}

function handleToggleSftp() {
  closeContextMenu();
  sessionStore.toggleSftp(props.tab.id);
}

function handleDuplicateTab() {
  closeContextMenu();
  sessionStore.duplicateTab(props.tab.id);
}

function handleReconnect() {
  closeContextMenu();
  reconnect();
}

// Add / Edit Command Modal State
const isAddModalOpen = ref(false);
const editingSnippetId = ref<string | null>(null);
const newCmdTitle = ref('');
const newCmdBody = ref('');
const saveScope = ref<'session' | 'global'>('session');
const titleInputRef = ref<HTMLInputElement | null>(null);

let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let unlistenData: (() => void) | null = null;
let unlistenClosed: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;

// Combined snippets: Session-specific snippets + Global snippets (dynamically resolved from vault)
const allSnippets = computed<SnippetItem[]>(() => {
  const map = new Map<string, SnippetItem>();

  // 1. Global snippets from vault
  const globalSnippets = vaultStore.vault.snippets || [];
  globalSnippets.forEach(s => map.set(s.id, s));

  // 2. Session snippets directly from vault by matching session ID
  const vaultSession = vaultStore.vault.sessions.find(s => s.id === props.tab.sessionConfig.id);
  if (vaultSession && vaultSession.snippets) {
    vaultSession.snippets.forEach(s => map.set(s.id, s));
  } else if (props.tab.sessionConfig.snippets) {
    props.tab.sessionConfig.snippets.forEach(s => map.set(s.id, s));
  }

  return Array.from(map.values());
});

function formatMb(mb: number): string {
  if (!mb) return '0M';
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)}G`;
  }
  return `${mb}M`;
}

async function fetchMetrics() {
  if (!props.tab.connected) return;
  loadingMetrics.value = true;
  try {
    const res = await tauriBridge.sshGetServerMetrics(props.tab.id);
    metrics.value = res;
    props.tab.metrics = res;
  } catch (err) {
    // silently ignore
  } finally {
    loadingMetrics.value = false;
  }
}

function focusThisTab() {
  sessionStore.activeTabId = props.tab.id;
  if (!isAddModalOpen.value && term) {
    term.focus();
  }
}

// Watch active tab change: auto-focus terminal (only if modal is closed)
watch(
  () => sessionStore.activeTabId,
  (newActiveId) => {
    if (newActiveId === props.tab.id && !isAddModalOpen.value && term) {
      nextTick(() => {
        term?.focus();
      });
    }
  }
);

function executeSnippet(snp: SnippetItem) {
  if (!props.tab.connected) return;
  const cmd = snp.command.endsWith('\n') ? snp.command : `${snp.command}\n`;
  tauriBridge.sshWrite(props.tab.id, cmd);
  if (term) term.focus();
}

async function openAddModal() {
  editingSnippetId.value = null;
  newCmdTitle.value = '';
  newCmdBody.value = '';
  saveScope.value = 'session';
  isAddModalOpen.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

async function openEditModal(snp: SnippetItem) {
  editingSnippetId.value = snp.id;
  newCmdTitle.value = snp.title;
  newCmdBody.value = snp.command;

  // Determine if it was session or global
  const vaultSession = vaultStore.vault.sessions.find(s => s.id === props.tab.sessionConfig.id);
  const isSessionLevel = (vaultSession?.snippets || props.tab.sessionConfig.snippets || []).some(s => s.id === snp.id);
  saveScope.value = isSessionLevel ? 'session' : 'global';

  isAddModalOpen.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

async function saveCommand() {
  if (!newCmdTitle.value.trim() || !newCmdBody.value.trim()) return;

  const targetTitle = newCmdTitle.value.trim();
  const targetCommand = newCmdBody.value.trim().endsWith('\n') ? newCmdBody.value.trim() : `${newCmdBody.value.trim()}\n`;

  const snippetId = editingSnippetId.value || `snp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const snippetItem: SnippetItem = {
    id: snippetId,
    title: targetTitle,
    command: targetCommand,
  };

  const targetSessionId = saveScope.value === 'session' ? props.tab.sessionConfig.id : null;

  // If editing and scope might have changed, remove old reference first
  if (editingSnippetId.value) {
    await vaultStore.removeSnippet(editingSnippetId.value, props.tab.sessionConfig.id);
  }

  // Save to persistent vault
  await vaultStore.saveSnippet(snippetItem, targetSessionId);

  // Synchronize local sessionConfig snippets array
  if (targetSessionId) {
    if (!props.tab.sessionConfig.snippets) props.tab.sessionConfig.snippets = [];
    const idx = props.tab.sessionConfig.snippets.findIndex(s => s.id === snippetId);
    if (idx >= 0) {
      props.tab.sessionConfig.snippets[idx] = { ...snippetItem };
    } else {
      props.tab.sessionConfig.snippets.push({ ...snippetItem });
    }
  }

  isAddModalOpen.value = false;
  editingSnippetId.value = null;
}

async function deleteSnippet(snp: SnippetItem) {
  const confirmed = await dialogStore.confirm({
    title: `Delete Command "${snp.title}"?`,
    description: `Are you sure you want to remove the quick command "${snp.command.trim()}"?`,
    confirmText: 'Delete',
    isDestructive: true,
  });
  if (!confirmed) return;

  await vaultStore.removeSnippet(snp.id, props.tab.sessionConfig.id);

  if (props.tab.sessionConfig.snippets) {
    props.tab.sessionConfig.snippets = props.tab.sessionConfig.snippets.filter(s => s.id !== snp.id);
  }
}

// Watch layout mode changes to trigger fit
watch(
  () => sessionStore.layoutMode,
  () => {
    setTimeout(() => {
      fitTerminal();
    }, 100);
  }
);

onMounted(async () => {
  await nextTick();
  initTerminal();
  connectSsh();

  if (terminalRef.value) {
    resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });
    resizeObserver.observe(terminalRef.value);
  }

  // Global click listener to close context menu
  window.addEventListener('click', closeContextMenu);
  window.addEventListener('blur', closeContextMenu);

  // Auto-fetch resource stats every 6 seconds for this tab
  metricsInterval = setInterval(() => {
    if (props.tab.connected) {
      fetchMetrics();
    }
  }, 6000);
});

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu);
  window.removeEventListener('blur', closeContextMenu);
  isExplicitlyClosed = true;
  cancelAutoReconnect();
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  cleanupListeners();
  if (term) term.dispose();
  tauriBridge.sshClose(props.tab.id).catch(() => {});
});

function cleanupListeners() {
  if (unlistenData) {
    unlistenData();
    unlistenData = null;
  }
  if (unlistenClosed) {
    unlistenClosed();
    unlistenClosed = null;
  }
}

function cancelAutoReconnect() {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  isReconnecting.value = false;
  if (term) term.writeln('\r\n\x1b[90m[Auto-reconnect cancelled]\x1b[0m\r\n');
}

function scheduleAutoReconnect() {
  if (isExplicitlyClosed) return;
  cancelAutoReconnect();

  isReconnecting.value = true;
  reconnectCountdown.value = 3;

  if (term) {
    term.writeln(`\r\n\x1b[33m[Connection closed by remote host. Auto-reconnecting in 3s...]\x1b[0m\r\n`);
  }

  reconnectTimer = setInterval(() => {
    reconnectCountdown.value -= 1;
    if (reconnectCountdown.value <= 0) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      isReconnecting.value = false;
      if (!isExplicitlyClosed) {
        connectSsh();
      }
    }
  }, 1000);
}

let resizeDebounceTimer: any = null;

function fitTerminal() {
  if (!fitAddon || !term || !terminalRef.value) return;
  if (terminalRef.value.clientWidth < 50 || terminalRef.value.clientHeight < 50) return;

  try {
    fitAddon.fit();
    const cols = term.cols;
    const rows = term.rows;

    // Strict validation: NEVER send 0 or negative dimensions to SSH PTY
    if (cols && rows && cols >= 10 && rows >= 2) {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        if (props.tab.connected) {
          tauriBridge.sshResize(props.tab.id, cols, rows).catch(() => {});
        }
      }, 100);
    }
  } catch (e) {
    // Ignored if terminal container is temporarily hidden or reflowing
  }
}

function initTerminal() {
  if (!terminalRef.value) return;

  term = new Terminal({
    cursorBlink: true,
    fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
    fontSize: 12,
    cursorStyle: 'bar',
    scrollback: 5000,
    allowTransparency: false,
    theme: {
      background: '#0b0d13',
      foreground: '#e2e8f0',
      cursor: '#38bdf8',
      selectionBackground: '#38bdf844',
      black: '#1e293b',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#facc15',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#38bdf8',
      white: '#f1f5f9',
    },
  });

  // Track selection anchor & head for progressive keyboard selection
  let selAnchorCol = -1;
  let selAnchorRow = -1;
  let selHeadCol = -1;
  let selHeadRow = -1;
  let isKeyboardSelecting = false;

  // Key Event Interception: Handle text selection with Shift+Arrow & Navigation shortcuts
  term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if (e.type === 'keydown') {
      // 1. Text Selection with Shift + Left/Right/Up/Down/Home/End
      if (e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
          if (!term) return false;
          const buffer = term.buffer.active;

          // Initialize anchor and head on first Shift+Arrow press
          if (!isKeyboardSelecting || selAnchorCol === -1) {
            selAnchorCol = buffer.cursorX;
            selAnchorRow = buffer.baseY + buffer.cursorY;
            selHeadCol = buffer.cursorX;
            selHeadRow = buffer.baseY + buffer.cursorY;
            isKeyboardSelecting = true;
          }

          // Move head according to key pressed
          if (e.key === 'ArrowLeft') {
            if (selHeadCol > 0) {
              selHeadCol -= 1;
            } else if (selHeadRow > 0) {
              selHeadRow -= 1;
              selHeadCol = term.cols - 1;
            }
          } else if (e.key === 'ArrowRight') {
            if (selHeadCol < term.cols - 1) {
              selHeadCol += 1;
            } else {
              selHeadRow += 1;
              selHeadCol = 0;
            }
          } else if (e.key === 'ArrowUp') {
            selHeadRow = Math.max(0, selHeadRow - 1);
          } else if (e.key === 'ArrowDown') {
            selHeadRow = Math.min(buffer.baseY + term.rows - 1, selHeadRow + 1);
          } else if (e.key === 'Home') {
            selHeadCol = 0;
          } else if (e.key === 'End') {
            selHeadCol = term.cols - 1;
          }

          // Determine start and end points in linear buffer terms
          const anchorLinear = selAnchorRow * term.cols + selAnchorCol;
          const headLinear = selHeadRow * term.cols + selHeadCol;

          const startLinear = Math.min(anchorLinear, headLinear);
          const endLinear = Math.max(anchorLinear, headLinear);
          const length = endLinear - startLinear;

          if (length > 0) {
            const startCol = startLinear % term.cols;
            const startRow = Math.floor(startLinear / term.cols);
            term.select(startCol, startRow, length);
          } else {
            term.clearSelection();
          }

          return false; // Prevent sending modifier sequence to remote shell
        }
      } else if (!e.shiftKey) {
        // Reset keyboard selection on regular arrow keys
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          isKeyboardSelecting = false;
          selAnchorCol = -1;
          selAnchorRow = -1;
          selHeadCol = -1;
          selHeadRow = -1;
          if (term && term.hasSelection()) {
            term.clearSelection();
          }
        }
      }

      // 2. Ctrl+C: Copy if text is selected, otherwise send interrupt to shell
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && !e.shiftKey && !e.altKey) {
        if (term && term.hasSelection()) {
          const sel = term.getSelection();
          if (sel) {
            navigator.clipboard.writeText(sel);
            return false; // Don't send SIGINT when user is copying highlighted text
          }
        }
      }

      // 3. Ctrl+V: Paste from clipboard
      if (e.ctrlKey && (e.key === 'v' || e.key === 'V') && !e.shiftKey && !e.altKey) {
        navigator.clipboard.readText().then(text => {
          if (text) {
            tauriBridge.sshWrite(props.tab.id, text);
          }
        }).catch(() => {});
        return false;
      }

      // 4. Tab Navigation Shortcuts
      if (e.ctrlKey && (e.key === 'Tab' || e.code === 'Tab')) {
        if (e.shiftKey) {
          sessionStore.prevTab();
        } else {
          sessionStore.nextTab();
        }
        return false;
      }

      if (e.ctrlKey && (e.key === '`' || e.code === 'Backquote')) {
        sessionStore.nextTab();
        return false;
      }

      if (e.ctrlKey && e.key === 'PageDown') {
        sessionStore.nextTab();
        return false;
      }
      if (e.ctrlKey && e.key === 'PageUp') {
        sessionStore.prevTab();
        return false;
      }

      if (e.altKey && e.key >= '1' && e.key <= '9') {
        sessionStore.selectTabByIndex(parseInt(e.key, 10) - 1);
        return false;
      }

      if (e.altKey && e.key === 'ArrowRight') {
        sessionStore.nextTab();
        return false;
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        sessionStore.prevTab();
        return false;
      }
    }
    return true;
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  term.open(terminalRef.value);

  // Intercept hidden textarea
  if (term.textarea) {
    term.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'Tab' || e.code === 'Tab')) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          sessionStore.prevTab();
        } else {
          sessionStore.nextTab();
        }
        return false;
      }
    }, { capture: true });
  }

  try {
    const webgl = new WebglAddon();
    term.loadAddon(webgl);
  } catch (e) {
    console.warn('WebGL addon not supported, falling back to canvas', e);
  }

  fitTerminal();

  term.onData((data) => {
    if (isReconnecting.value) {
      cancelAutoReconnect();
      return;
    }
    tauriBridge.sshWrite(props.tab.id, data);
  });

  term.onResize((size) => {
    if (props.tab.connected && size.cols >= 10 && size.rows >= 2) {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        if (props.tab.connected) {
          tauriBridge.sshResize(props.tab.id, size.cols, size.rows).catch(() => {});
        }
      }, 100);
    }
  });

  window.addEventListener('resize', handleWindowResize);
}

function handleWindowResize() {
  fitTerminal();
}

async function connectSsh() {
  if (!term || !fitAddon || isExplicitlyClosed) return;
  props.tab.connected = false;
  props.tab.error = undefined;

  // Cleanup existing listeners and old SSH backend session before connecting
  cleanupListeners();
  await tauriBridge.sshClose(props.tab.id).catch(() => {});

  term.writeln(`\x1b[36mConnecting to ${props.tab.sessionConfig.username}@${props.tab.sessionConfig.host}:${props.tab.sessionConfig.port}...\x1b[0m\r\n`);

  try {
    // Register listeners
    unlistenData = await tauriBridge.onSshData(props.tab.id, (data) => {
      if (term) term.write(data);
    });

    unlistenClosed = await tauriBridge.onSshClosed(props.tab.id, () => {
      props.tab.connected = false;
      // Auto reconnect on remote disconnection
      scheduleAutoReconnect();
    });

    // Lookup SSH key if key auth is used
    let keyItem;
    if (props.tab.sessionConfig.auth_type === 'key') {
      if (props.tab.sessionConfig.key_id) {
        keyItem = vaultStore.vault.keys.find(k => k.id === props.tab.sessionConfig.key_id);
        if (!keyItem) {
          throw new Error(`Configured SSH Key (ID: ${props.tab.sessionConfig.key_id}) not found in vault.`);
        }
      } else {
        throw new Error('No SSH Key selected for this session. Please edit session and attach a key.');
      }
    }

    const { cols, rows } = term;
    await tauriBridge.sshConnect(
      props.tab.id,
      props.tab.sessionConfig,
      keyItem,
      cols || 80,
      rows || 24
    );

    // Clear previous disconnect messages / history on successful connect
    term.clear();
    props.tab.connected = true;
    term.focus();

    // Fetch initial metrics
    setTimeout(() => {
      fetchMetrics();
    }, 1000);
  } catch (err: any) {
    props.tab.connected = false;
    props.tab.error = String(err);
    if (term) term.writeln(`\x1b[31mConnection error: ${err}\x1b[0m\r\n`);
  }
}

function reconnect() {
  cancelAutoReconnect();
  if (term) term.clear();
  connectSsh();
}
</script>
