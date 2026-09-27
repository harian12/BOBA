<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-boba-950/80 z-50 flex items-center justify-center p-4 select-none"
    @click.self="$emit('close')"
  >
    <div
      ref="panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      tabindex="-1"
      class="bg-boba-900 border border-boba-700 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"
    >
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-boba-800 shrink-0">
        <div>
          <h2 id="shortcuts-title" class="text-base font-bold text-slate-100">Pintasan Keyboard</h2>
          <p class="text-[11px] text-slate-400 mt-0.5">Tekan <kbd class="boba-kbd">Esc</kbd> atau klik di luar untuk menutup</p>
        </div>
        <button
          @click="$emit('close')"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 transition"
          title="Tutup daftar pintasan"
          aria-label="Tutup daftar pintasan"
        >
          <Icon icon="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <div class="overflow-y-auto px-5 py-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          <section v-for="group in SHORTCUT_GROUPS" :key="group.title">
            <h3 class="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-0.5">{{ group.title }}</h3>
            <p class="text-[11px] text-slate-500 mb-2">{{ group.hint }}</p>
            <ul class="space-y-0.5">
              <li
                v-for="item in group.items"
                :key="item.description"
                class="flex items-start justify-between gap-3 py-1"
              >
                <span class="text-xs text-slate-300 leading-snug">{{ item.description }}</span>
                <span class="flex items-center gap-1 shrink-0 pt-px">
                  <kbd v-for="(k, i) in item.keys" :key="k + i" class="boba-kbd">{{ k }}</kbd>
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { SHORTCUT_GROUPS } from '../constants/shortcuts.js';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);

watch(
  () => props.isOpen,
  async (open) => {
    if (!open) return;
    await nextTick();
    panel.value?.focus();
  }
);

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    emit('close');
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) window.addEventListener('keydown', onKeyDown, true);
    else window.removeEventListener('keydown', onKeyDown, true);
  }
);
</script>

<style scoped>
.boba-kbd {
  display: inline-block;
  min-width: 18px;
  padding: 1px 5px;
  border: 1px solid #283147;
  border-bottom-width: 2px;
  border-radius: 4px;
  background: #1c2232;
  color: #cbd5e1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
}
</style>
