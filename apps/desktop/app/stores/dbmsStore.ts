import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useVaultStore } from './vaultStore.js';
import { useSessionStore } from './sessionStore.js';
import type { DbConnectionConfig } from '../types/index.js';

export const useDbmsStore = defineStore('dbms', () => {
  const vaultStore = useVaultStore();
  const sessionStore = useSessionStore();

  const isModalOpen = ref(false);
  const editingDbConfig = ref<DbConnectionConfig | null>(null);

  const databases = computed<DbConnectionConfig[]>(() => {
    return vaultStore.vault.databases || [];
  });

  async function saveDatabase(config: DbConnectionConfig) {
    if (!vaultStore.vault.databases) {
      vaultStore.vault.databases = [];
    }

    const idx = vaultStore.vault.databases.findIndex(d => d.id === config.id);
    if (idx >= 0) {
      vaultStore.vault.databases[idx] = { ...config };
    } else {
      vaultStore.vault.databases.push({ ...config });
    }

    await vaultStore.persist(true);
  }

  async function removeDatabase(id: string) {
    if (!vaultStore.vault.databases) return;
    vaultStore.vault.databases = vaultStore.vault.databases.filter(d => d.id !== id);
    await vaultStore.persist(true);
  }

  function openNewModal() {
    editingDbConfig.value = null;
    isModalOpen.value = true;
  }

  function openEditModal(config: DbConnectionConfig) {
    editingDbConfig.value = { ...config };
    isModalOpen.value = true;
  }

  function connectDatabase(config: DbConnectionConfig) {
    sessionStore.openDbmsTab(config);
  }

  return {
    isModalOpen,
    editingDbConfig,
    databases,
    saveDatabase,
    removeDatabase,
    openNewModal,
    openEditModal,
    connectDatabase,
  };
});
