<template>
  <div
    class="h-full w-full flex flex-col bg-[#0d1017] text-slate-100 overflow-hidden relative select-none"
    @click="sessionStore.activeTabId = tab.id"
  >
    <!-- Editor Header Toolbar -->
    <div
      class="h-7 border-b flex items-center justify-between px-2.5 text-[11px] font-mono select-none shrink-0 transition-colors"
      :class="[
        sessionStore.activeTabId === tab.id
          ? 'bg-[#161b26] border-sky-500/50 text-slate-100'
          : 'bg-[#10131c] border-[#232936] text-slate-400'
      ]"
    >
      <!-- Left: File Name & Path -->
      <div class="flex items-center space-x-2 truncate">
        <span class="text-xs">{{ getFileIcon(tab.editorFile?.name || '') }}</span>
        <span class="font-semibold text-slate-200 truncate">
          {{ tab.editorFile?.name }}
        </span>
        <span
          v-if="isDirty"
          class="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0"
          title="Unsaved changes"
        ></span>
        <span class="text-slate-500 truncate text-[10px] hidden md:inline">
          {{ tab.editorFile?.path }}
        </span>
      </div>

      <!-- Right: Action Buttons (Save, Reload) -->
      <div class="flex items-center space-x-1.5 shrink-0">
        <!-- Save Feedback Banner -->
        <span v-if="saveSuccess" class="text-emerald-400 font-sans text-[10px] animate-fade-in flex items-center space-x-1">
          <span>✓</span>
          <span>Saved to remote</span>
        </span>
        <span v-else-if="saveError" class="text-rose-400 font-sans text-[10px] truncate max-w-[150px]" :title="saveError">
          ✗ {{ saveError }}
        </span>

        <!-- Reload Button -->
        <button
          @click.stop="reloadFromRemote"
          :disabled="isSaving"
          class="px-2 py-0.5 bg-[#1e2330] hover:bg-[#283042] text-slate-300 rounded text-[10px] font-medium transition flex items-center space-x-1 disabled:opacity-50"
          title="Reload file from remote server"
        >
          <span :class="{ 'animate-spin': isReloading }">🔄</span>
          <span>Reload</span>
        </button>

        <!-- Save Button -->
        <button
          @click.stop="saveFile"
          :disabled="isSaving || !isDirty"
          :class="[
            'px-2.5 py-0.5 rounded text-[10px] font-medium transition flex items-center space-x-1 shadow-sm',
            isDirty
              ? 'bg-sky-600 hover:bg-sky-500 text-white font-bold animate-pulse'
              : 'bg-[#1e2330] text-slate-500 cursor-default'
          ]"
          title="Save file to remote host (Ctrl+S)"
        >
          <span v-if="isSaving" class="animate-spin">⏳</span>
          <span v-else>💾</span>
          <span>{{ isSaving ? 'Saving...' : 'Save (Ctrl+S)' }}</span>
        </button>
      </div>
    </div>

    <!-- Code Editor Canvas Area -->
    <div class="flex-1 flex overflow-hidden relative font-mono text-xs bg-[#0b0d13]">
      <!-- Line Number Column -->
      <div
        ref="lineNumbersRef"
        class="w-12 py-2 pr-2.5 pl-1 text-right text-slate-600 bg-[#090b10] border-r border-[#1f2533] select-none overflow-hidden shrink-0 font-mono text-[11px] leading-[18px]"
      >
        <div
          v-for="n in lineCount"
          :key="n"
          :class="[
            'transition-colors',
            currentLine === n ? 'text-sky-400 font-bold bg-sky-950/30 -mr-2.5 pr-2.5 rounded-l' : ''
          ]"
        >
          {{ n }}
        </div>
      </div>

      <!-- Main Textarea Editor -->
      <textarea
        ref="textareaRef"
        v-model="content"
        @scroll="handleScroll"
        @keydown="handleKeyDown"
        @click="updateCursorPos"
        @keyup="updateCursorPos"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        class="flex-1 h-full w-full bg-transparent p-2 text-slate-100 placeholder-slate-600 font-mono text-[11px] leading-[18px] focus:outline-none resize-none no-scrollbar whitespace-pre overflow-auto tab-size-2 select-text"
        placeholder="Empty file..."
      ></textarea>
    </div>

    <!-- Editor Footer Status Bar -->
    <div
      class="h-5 bg-[#090b10] border-t border-[#1f2533] px-3 flex items-center justify-between text-[10px] font-mono select-none text-slate-500 shrink-0"
    >
      <div class="flex items-center space-x-3">
        <span class="text-slate-400">{{ tab.sessionConfig.username }}@{{ tab.sessionConfig.host }}</span>
        <span class="text-slate-600">|</span>
        <span>{{ fileExtension.toUpperCase() || 'PLAIN TEXT' }}</span>
        <span class="text-slate-600">|</span>
        <span>UTF-8</span>
      </div>

      <div class="flex items-center space-x-3">
        <span>Ln {{ currentLine }}, Col {{ currentCol }}</span>
        <span class="text-slate-600">|</span>
        <span>{{ lineCount }} lines</span>
        <span class="text-slate-600">|</span>
        <span>{{ content.length }} chars</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useSessionStore } from '../stores/sessionStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import { tauriBridge } from '../services/tauriBridge.js';
import type { ActiveTab } from '../types/index.js';

const props = defineProps<{
  tab: ActiveTab;
}>();

const sessionStore = useSessionStore();
const dialogStore = useDialogStore();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const lineNumbersRef = ref<HTMLDivElement | null>(null);

const content = ref(props.tab.editorFile?.content || '');
const originalContent = ref(props.tab.editorFile?.originalContent || '');
const isSaving = ref(false);
const isReloading = ref(false);
const saveSuccess = ref(false);
const saveError = ref<string | null>(null);

const currentLine = ref(1);
const currentCol = ref(1);

const isDirty = computed(() => {
  return content.value !== originalContent.value;
});

// Update dirty state in store
watch(isDirty, (newDirty) => {
  if (props.tab.editorFile) {
    props.tab.editorFile.isDirty = newDirty;
    props.tab.editorFile.content = content.value;
  }
});

const lineCount = computed(() => {
  if (!content.value) return 1;
  return content.value.split('\n').length;
});

const fileExtension = computed(() => {
  const name = props.tab.editorFile?.name || '';
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.substring(idx + 1).toLowerCase() : '';
});

function getFileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.mjs')) return '🟨';
  if (lower.endsWith('.vue') || lower.endsWith('.jsx') || lower.endsWith('.tsx')) return '🟩';
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return '📦';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return '⚙️';
  if (lower.endsWith('.py')) return '🐍';
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return '🐚';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return '🌐';
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return '🎨';
  if (lower.endsWith('.md') || lower.endsWith('.txt')) return '📝';
  if (lower.endsWith('.sql')) return '🗄️';
  if (lower.endsWith('.rs')) return '🦀';
  if (lower.endsWith('.go')) return '🐹';
  if (lower.endsWith('.dockerfile') || lower.includes('docker')) return '🐳';
  if (lower.endsWith('.env') || lower.endsWith('.conf') || lower.endsWith('.ini')) return '🔒';
  return '📄';
}

function handleScroll() {
  if (textareaRef.value && lineNumbersRef.value) {
    lineNumbersRef.value.scrollTop = textareaRef.value.scrollTop;
  }
}

function updateCursorPos() {
  if (!textareaRef.value) return;
  const pos = textareaRef.value.selectionStart;
  const before = content.value.substring(0, pos);
  const lines = before.split('\n');
  currentLine.value = lines.length;
  currentCol.value = lines[lines.length - 1].length + 1;
}

function handleKeyDown(e: KeyboardEvent) {
  // Save shortcut: Ctrl+S / Cmd+S
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    saveFile();
    return;
  }

  // Tab key handling: Insert 2 spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    if (!textareaRef.value) return;

    const start = textareaRef.value.selectionStart;
    const end = textareaRef.value.selectionEnd;

    // Set textarea value to: text before caret + 2 spaces + text after caret
    content.value = content.value.substring(0, start) + '  ' + content.value.substring(end);

    nextTick(() => {
      if (textareaRef.value) {
        textareaRef.value.selectionStart = textareaRef.value.selectionEnd = start + 2;
        updateCursorPos();
      }
    });
  }
}

async function saveFile() {
  if (isSaving.value || !props.tab.editorFile) return;
  isSaving.value = true;
  saveError.value = null;
  saveSuccess.value = false;

  const parentSessionId = props.tab.editorFile.parentSessionId;
  const remotePath = props.tab.editorFile.path;

  try {
    await tauriBridge.sftpWriteFile(parentSessionId, remotePath, content.value);
    originalContent.value = content.value;
    if (props.tab.editorFile) {
      props.tab.editorFile.originalContent = content.value;
      props.tab.editorFile.isDirty = false;
    }
    saveSuccess.value = true;
    setTimeout(() => {
      saveSuccess.value = false;
    }, 2500);
  } catch (err: any) {
    saveError.value = String(err);
  } finally {
    isSaving.value = false;
  }
}

async function reloadFromRemote() {
  if (isReloading.value || !props.tab.editorFile) return;

  if (isDirty.value) {
    const confirm = await dialogStore.confirm({
      title: 'Discard Unsaved Changes?',
      description: 'You have unsaved changes. Reloading from the remote server will overwrite them.',
      confirmText: 'Discard & Reload',
      isDestructive: true,
    });
    if (!confirm) return;
  }

  isReloading.value = true;
  saveError.value = null;

  try {
    const fresh = await tauriBridge.sftpReadFile(props.tab.editorFile.parentSessionId, props.tab.editorFile.path);
    content.value = fresh;
    originalContent.value = fresh;
    if (props.tab.editorFile) {
      props.tab.editorFile.content = fresh;
      props.tab.editorFile.originalContent = fresh;
      props.tab.editorFile.isDirty = false;
    }
  } catch (err: any) {
    saveError.value = `Reload failed: ${err}`;
  } finally {
    isReloading.value = false;
  }
}

onMounted(() => {
  nextTick(() => {
    textareaRef.value?.focus();
    updateCursorPos();
  });
});
</script>

<style scoped>
.tab-size-2 {
  tab-size: 2;
  -moz-tab-size: 2;
}
</style>
