<template>
  <div
    v-if="dialogStore.isOpen"
    class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    @keydown.esc="dialogStore.handleCancel"
  >
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
      <!-- Dialog Header -->
      <div class="space-y-1.5">
        <h3 class="text-base font-bold text-slate-100 flex items-center space-x-2">
          <span v-if="dialogStore.options.variant === 'error'" class="text-rose-400">⚠️</span>
          <span v-else-if="dialogStore.options.variant === 'warning'" class="text-amber-400">⚠️</span>
          <span v-else-if="dialogStore.options.variant === 'success'" class="text-emerald-400">✅</span>
          <span>{{ dialogStore.options.title }}</span>
        </h3>
        <p
          v-if="dialogStore.options.description"
          class="text-xs text-slate-300 leading-relaxed break-words"
        >
          {{ dialogStore.options.description }}
        </p>
      </div>

      <!-- Prompt Input -->
      <form
        v-if="dialogStore.options.type === 'prompt'"
        @submit.prevent="dialogStore.handleConfirm"
        class="pt-1"
      >
        <input
          ref="inputRef"
          v-model="dialogStore.inputValue"
          :type="dialogStore.options.inputType || 'text'"
          :placeholder="dialogStore.options.placeholder"
          class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
        />
      </form>

      <!-- Action Buttons -->
      <div class="flex items-center justify-end space-x-2 pt-2 border-t border-boba-800">
        <button
          v-if="dialogStore.options.type !== 'alert'"
          type="button"
          @click="dialogStore.handleCancel"
          class="px-3.5 py-1.5 border border-boba-700 hover:bg-boba-800 rounded-lg text-xs font-medium text-slate-300 transition"
        >
          {{ dialogStore.options.cancelText || 'Cancel' }}
        </button>

        <button
          type="button"
          @click="dialogStore.handleConfirm"
          :class="[
            'px-4 py-1.5 rounded-lg text-xs font-medium transition shadow-md text-white',
            dialogStore.options.isDestructive
              ? 'bg-rose-600 hover:bg-rose-500'
              : 'bg-boba-accent hover:bg-boba-accent-hover'
          ]"
        >
          {{ dialogStore.options.confirmText || 'OK' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Global Toast Notifications Container -->
  <div class="fixed top-4 right-4 z-[99999] flex flex-col space-y-2 pointer-events-none select-none">
    <div
      v-for="t in dialogStore.toasts"
      :key="t.id"
      :class="[
        'pointer-events-auto px-4 py-2.5 rounded-xl text-xs font-mono shadow-2xl flex items-center space-x-2.5 border backdrop-blur-md animate-in slide-in-from-top-4 fade-in duration-200',
        t.variant === 'success' ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100 shadow-emerald-950/40' :
        t.variant === 'error' ? 'bg-rose-950/95 border-rose-500/60 text-rose-100 shadow-rose-950/40' :
        t.variant === 'warning' ? 'bg-amber-950/95 border-amber-500/60 text-amber-100 shadow-amber-950/40' :
        'bg-[#121624]/95 border-sky-500/60 text-sky-100 shadow-sky-950/40'
      ]"
    >
      <span class="text-sm shrink-0">
        {{ t.variant === 'success' ? '✅' : t.variant === 'error' ? '❌' : t.variant === 'warning' ? '⚠️' : 'ℹ️' }}
      </span>
      <span class="max-w-xs break-words leading-relaxed font-sans font-medium text-[12px]">{{ t.message }}</span>
      <button
        @click="dialogStore.removeToast(t.id)"
        class="text-slate-400 hover:text-white ml-2 text-xs p-0.5 rounded transition"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useDialogStore } from '../stores/dialogStore.js';

const dialogStore = useDialogStore();
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => dialogStore.isOpen,
  async (isOpen) => {
    if (isOpen && dialogStore.options.type === 'prompt') {
      await nextTick();
      inputRef.value?.focus();
      inputRef.value?.select();
    }
  }
);
</script>
