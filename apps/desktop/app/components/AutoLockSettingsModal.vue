<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-boba-950/80 backdrop-blur-sm p-4 select-none"
    @click.self="$emit('close')"
  >
    <div
      role="dialog"
      aria-modal="true"
      class="w-full max-w-md p-6 rounded-xl bg-boba-900 border border-boba-700 text-slate-100 shadow-2xl space-y-4"
    >
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <div class="flex items-center space-x-2">
          <Icon icon="lucide:timer" class="w-5 h-5 text-sky-400" />
          <h2 class="text-base font-bold text-slate-100">Kunci Otomatis (Auto-Lock)</h2>
        </div>
        <button
          @click="$emit('close')"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 transition text-sm"
        >
          ✕
        </button>
      </div>

      <p class="text-xs text-slate-400">
        Kunci Proteksi Data secara otomatis setelah periode tidak ada aktivitas keyboard atau mouse pada aplikasi.
      </p>

      <div class="space-y-1.5 pt-1">
        <label
          v-for="opt in options"
          :key="opt.val"
          :class="[
            'flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition text-xs font-mono',
            selected === opt.val
              ? 'bg-sky-950/40 border-sky-500/70 text-sky-300'
              : 'bg-boba-950/60 border-boba-800 text-slate-300 hover:bg-boba-850 hover:border-boba-700'
          ]"
        >
          <div class="flex items-center space-x-2.5">
            <input
              type="radio"
              :value="opt.val"
              v-model="selected"
              @change="save"
              class="accent-sky-500"
            />
            <span>{{ opt.label }}</span>
          </div>
          <span v-if="selected === opt.val" class="text-[10px] text-sky-400 font-semibold font-sans">Aktif</span>
        </label>
      </div>

      <div class="pt-2 border-t border-boba-800 flex justify-end">
        <button
          @click="$emit('close')"
          class="px-4 py-1.5 rounded-lg bg-boba-800 hover:bg-boba-700 text-xs text-slate-200 transition font-medium"
        >
          Selesai
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useAutoLock } from '../composables/useAutoLock.js';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { timeoutMinutes, setTimeoutMinutes } = useAutoLock();
const selected = ref(timeoutMinutes.value);

const options = [
  { val: 0, label: 'Nonaktif (Manual saja)' },
  { val: 5, label: '5 Menit' },
  { val: 15, label: '15 Menit (Rekomendasi)' },
  { val: 30, label: '30 Menit' },
  { val: 60, label: '1 Jam' },
];

watch(() => props.isOpen, (val) => {
  if (val) selected.value = timeoutMinutes.value;
});

function save() {
  setTimeoutMinutes(selected.value);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close');
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown));
onUnmounted(() => window.removeEventListener('keydown', onKeyDown));
</script>
