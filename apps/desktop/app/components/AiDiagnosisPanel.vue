<template>
  <div class="border-t border-purple-900/50 bg-[#0c0a16] shrink-0 flex flex-col" :class="maxHeightClass">
    <div class="flex items-center gap-2 px-2.5 py-1.5 border-b border-purple-900/40 shrink-0">
      <span class="flex items-center gap-1.5 text-[10px] font-bold text-purple-300 uppercase tracking-wider">
        <Icon
          :icon="thinking ? 'lucide:loader-2' : 'lucide:sparkles'"
          :class="['w-3 h-3 shrink-0', thinking ? 'animate-spin' : '']"
        />
        {{ thinking ? 'AI sedang menganalisa' : title }}
      </span>

      <div class="flex-1"></div>

      <!-- Copy only what the user highlighted, when there is a selection -->
      <button
        v-if="selection"
        @click="copySelection"
        class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-900/60 hover:bg-purple-800 border border-purple-700/60 text-purple-200 transition flex items-center gap-1"
        :title="`Salin ${selection.length} karakter yang dipilih`"
      >
        <Icon icon="lucide:text-select" class="w-3 h-3" />
        Salin pilihan ({{ selection.length }})
      </button>

      <button
        v-if="!thinking && !error && answer"
        @click="copyAll"
        class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-950/70 hover:bg-purple-900 border border-purple-700/60 text-purple-300 transition flex items-center gap-1"
        title="Salin seluruh jawaban AI"
      >
        <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" :class="['w-3 h-3', copied ? 'text-emerald-400' : '']" />
        {{ copied ? 'Tersalin' : 'Salin' }}
      </button>

      <button
        @click="$emit('close')"
        class="text-slate-500 hover:text-slate-200 transition"
        title="Tutup panel"
      >
        <Icon icon="lucide:x" class="w-3 h-3" />
      </button>
    </div>

    <div
      ref="bodyRef"
      class="overflow-y-auto p-2.5 text-[10px] leading-relaxed select-text cursor-text"
      @mouseup="refreshSelection"
      @keyup="refreshSelection"
    >
      <div v-if="thinking" class="flex items-center gap-2 text-slate-500 font-mono">
        <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0"></span>
        {{ thinkingNote || 'Mengirim data ke AI Copilot...' }}
      </div>
      <div v-else-if="error" class="text-red-400 font-mono select-text">{{ error }}</div>
      <div v-else-if="answer" class="text-slate-300 font-sans whitespace-pre-wrap break-words select-text">
        {{ answer }}
      </div>
      <div v-else class="text-slate-600 font-mono">Belum ada hasil.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';

const props = withDefaults(
  defineProps<{
    answer?: string;
    error?: string | null;
    thinking?: boolean;
    thinkingNote?: string;
    title?: string;
    /** Tailwind height class, so the caller can match the space it has. */
    maxHeightClass?: string;
  }>(),
  {
    answer: '',
    error: null,
    thinking: false,
    thinkingNote: '',
    title: 'Hasil Diagnosa AI',
    maxHeightClass: 'max-h-80'
  }
);

defineEmits<{ close: [] }>();

const bodyRef = ref<HTMLElement | null>(null);
const copied = ref(false);
const selection = ref('');

const onBody = computed(() => props.answer || props.error || '');

/**
 * Read whatever the user dragged over. Copying a highlighted fragment matters
 * more than copying everything: the useful part of a diagnosis is usually one
 * command or one line of explanation, and forcing a select-all would take that
 * away.
 */
function refreshSelection() {
  const sel = window.getSelection();
  const text = sel?.toString().trim() ?? '';
  // Only count a selection that actually lies inside this panel.
  const node = sel?.anchorNode;
  const inside = !!node && !!bodyRef.value && bodyRef.value.contains(node);
  selection.value = inside && text ? text : '';
}

async function writeClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

let copiedTimer: ReturnType<typeof setTimeout> | null = null;

async function flashCopied() {
  copied.value = true;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copiedTimer = null;
    copied.value = false;
  }, 1600);
}

async function copyAll() {
  if (await writeClipboard(onBody.value)) {
    window.getSelection()?.removeAllRanges();
    selection.value = '';
    await flashCopied();
  }
}

async function copySelection() {
  if (await writeClipboard(selection.value)) {
    window.getSelection()?.removeAllRanges();
    selection.value = '';
    await flashCopied();
  }
}

// A selection made before a re-render would otherwise leave a stale button,
// and a pending "copied" flash must not fire into a dead component.
onUnmounted(() => {
  selection.value = '';
  if (copiedTimer) {
    clearTimeout(copiedTimer);
    copiedTimer = null;
  }
});
</script>
