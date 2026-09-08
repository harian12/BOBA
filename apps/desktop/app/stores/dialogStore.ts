import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface DialogOptions {
  type: 'alert' | 'confirm' | 'prompt';
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  inputType?: 'text' | 'password';
  isDestructive?: boolean;
  variant?: 'info' | 'success' | 'warning' | 'error';
}

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  variant: 'info' | 'success' | 'warning' | 'error';
  timeoutMs?: number;
}

export const useDialogStore = defineStore('dialog', () => {
  const isOpen = ref(false);
  const options = ref<DialogOptions>({
    type: 'alert',
    title: '',
  });
  const inputValue = ref('');
  const toasts = ref<ToastItem[]>([]);
  let resolvePromise: ((value: any) => void) | null = null;

  function showToast(
    message: string,
    variant: 'info' | 'success' | 'warning' | 'error' = 'info',
    timeoutMs = 4000,
    title?: string
  ) {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    toasts.value.push({ id, title, message, variant, timeoutMs });
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id);
    }, timeoutMs);
  }

  function removeToast(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  function alert(opts: {
    title: string;
    description?: string;
    confirmText?: string;
    variant?: 'info' | 'success' | 'warning' | 'error';
  }): Promise<void> {
    showToast(
      opts.description || opts.title,
      opts.variant || 'info',
      4000,
      opts.description ? opts.title : undefined
    );
    return Promise.resolve();
  }

  function confirm(opts: {
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      options.value = {
        type: 'confirm',
        title: opts.title,
        description: opts.description,
        confirmText: opts.confirmText || 'Confirm',
        cancelText: opts.cancelText || 'Cancel',
        isDestructive: opts.isDestructive ?? false,
      };
      inputValue.value = '';
      resolvePromise = resolve;
      isOpen.value = true;
    });
  }

  function prompt(opts: {
    title: string;
    description?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
    inputType?: 'text' | 'password';
  }): Promise<string | null> {
    return new Promise((resolve) => {
      options.value = {
        type: 'prompt',
        title: opts.title,
        description: opts.description,
        placeholder: opts.placeholder || '',
        defaultValue: opts.defaultValue || '',
        confirmText: opts.confirmText || 'Save',
        cancelText: opts.cancelText || 'Cancel',
        inputType: opts.inputType || 'text',
      };
      inputValue.value = opts.defaultValue || '';
      resolvePromise = resolve;
      isOpen.value = true;
    });
  }

  function handleConfirm() {
    isOpen.value = false;
    if (resolvePromise) {
      if (options.value.type === 'prompt') {
        resolvePromise(inputValue.value.trim());
      } else if (options.value.type === 'confirm') {
        resolvePromise(true);
      } else {
        resolvePromise(undefined);
      }
      resolvePromise = null;
    }
  }

  function handleCancel() {
    isOpen.value = false;
    if (resolvePromise) {
      if (options.value.type === 'prompt') {
        resolvePromise(null);
      } else if (options.value.type === 'confirm') {
        resolvePromise(false);
      } else {
        resolvePromise(undefined);
      }
      resolvePromise = null;
    }
  }

  return {
    isOpen,
    options,
    inputValue,
    toasts,
    showToast,
    removeToast,
    alert,
    confirm,
    prompt,
    handleConfirm,
    handleCancel,
  };
});

// Global guard: cegah native browser / Windows OS alert dialog muncul di WebView
if (typeof window !== 'undefined') {
  window.alert = (message?: any) => {
    try {
      const store = useDialogStore();
      store.showToast(String(message ?? ''), 'warning', 4000);
    } catch {
      console.warn('Native alert intercepted:', message);
    }
  };
}
