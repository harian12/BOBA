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

export const useDialogStore = defineStore('dialog', () => {
  const isOpen = ref(false);
  const options = ref<DialogOptions>({
    type: 'alert',
    title: '',
  });
  const inputValue = ref('');
  let resolvePromise: ((value: any) => void) | null = null;

  function alert(opts: {
    title: string;
    description?: string;
    confirmText?: string;
    variant?: 'info' | 'success' | 'warning' | 'error';
  }): Promise<void> {
    return new Promise((resolve) => {
      options.value = {
        type: 'alert',
        title: opts.title,
        description: opts.description,
        confirmText: opts.confirmText || 'OK',
        variant: opts.variant || 'info',
      };
      inputValue.value = '';
      resolvePromise = resolve;
      isOpen.value = true;
    });
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
    alert,
    confirm,
    prompt,
    handleConfirm,
    handleCancel,
  };
});
