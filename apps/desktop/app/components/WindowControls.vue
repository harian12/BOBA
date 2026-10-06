<template>
  <div class="flex items-center h-full shrink-0 select-none no-drag">
    <!-- Minimize -->
    <button
      type="button"
      @click="handleMinimize"
      title="Minimize"
      aria-label="Minimize"
      class="w-11 h-full inline-flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/10 active:bg-white/15 transition-colors focus:outline-none"
    >
      <svg class="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1">
        <path d="M2 6h8" stroke-linecap="round" />
      </svg>
    </button>

    <!-- Maximize / Restore -->
    <button
      type="button"
      @click="handleToggleMaximize"
      :title="isMaximized ? 'Restore Down' : 'Maximize'"
      :aria-label="isMaximized ? 'Restore Down' : 'Maximize'"
      class="w-11 h-full inline-flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/10 active:bg-white/15 transition-colors focus:outline-none"
    >
      <!-- Restore Icon (when window is maximized) -->
      <svg v-if="isMaximized" class="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1">
        <path d="M4 2.5h5.5v5.5" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="2.5" y="4" width="5.5" height="5.5" rx="0.5" stroke-linejoin="round" />
      </svg>
      <!-- Maximize Icon (when window is normal) -->
      <svg v-else class="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1">
        <rect x="2" y="2" width="8" height="8" rx="0.8" stroke-linejoin="round" />
      </svg>
    </button>

    <!-- Close -->
    <button
      type="button"
      @click="handleClose"
      title="Close"
      aria-label="Close"
      class="w-11 h-full inline-flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#e81123] active:bg-[#c4101f] transition-colors focus:outline-none"
    >
      <svg class="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';

const isMaximized = ref(false);
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let unlistenResize: (() => void) | null = null;

async function syncMaximizedState() {
  if (!isTauri) return;
  try {
    const win = getCurrentWindow();
    isMaximized.value = await win.isMaximized();
  } catch (err) {
    console.debug('Failed to sync maximized state:', err);
  }
}

function handleMinimize() {
  if (!isTauri) return;
  try {
    getCurrentWindow().minimize();
  } catch (err) {
    console.error('Failed to minimize window:', err);
  }
}

async function handleToggleMaximize() {
  if (!isTauri) return;
  try {
    const win = getCurrentWindow();
    await win.toggleMaximize();
    isMaximized.value = await win.isMaximized();
  } catch (err) {
    console.error('Failed to toggle maximize window:', err);
  }
}

function handleClose() {
  if (!isTauri) return;
  try {
    getCurrentWindow().close();
  } catch (err) {
    console.error('Failed to close window:', err);
  }
}

onMounted(async () => {
  if (isTauri) {
    await syncMaximizedState();
    try {
      const win = getCurrentWindow();
      const unlisten = await win.onResized(async () => {
        await syncMaximizedState();
      });
      unlistenResize = unlisten;
    } catch (err) {
      console.debug('Failed to bind window resize listener:', err);
    }
  }

  // Also bind native window resize event as fallback
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncMaximizedState);
  }
});

onUnmounted(() => {
  if (unlistenResize) {
    unlistenResize();
    unlistenResize = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncMaximizedState);
  }
});
</script>

<style scoped>
.no-drag {
  -webkit-app-region: no-drag;
}
</style>
