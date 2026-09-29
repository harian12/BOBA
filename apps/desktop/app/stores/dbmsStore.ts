import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useVaultStore } from './vaultStore.js';
import { useSessionStore } from './sessionStore.js';
import { tauriBridge } from '../services/tauriBridge.js';
import type { DbConnectionConfig, DbSavedQuery } from '../types/index.js';

export const useDbmsStore = defineStore('dbms', () => {
  const vaultStore = useVaultStore();
  const sessionStore = useSessionStore();

  const isModalOpen = ref(false);
  const editingDbConfig = ref<DbConnectionConfig | null>(null);

  const databases = computed<DbConnectionConfig[]>(() => {
    return vaultStore.vault.databases || [];
  });

  const savedQueries = computed<DbSavedQuery[]>(() => {
    return vaultStore.vault.db_snippets || [];
  });

  async function getErdLayoutPath(dbId: string, dbName: string): Promise<string> {
    const appData = await tauriBridge.getAppDataDir();
    // Use .boba/erd-layouts to keep it clean. For simplicity, just appData + boba-erd-layouts
    // because getAppDataDir already includes the app bundle identifier on some platforms,
    // but on dev it might just be Roaming\com.boba.app.
    const dir = `${appData}/erd-layouts`;
    await tauriBridge.fsCreateDir(dir).catch(() => {}); // ignore if exists
    // Sanitize dbName to prevent path traversal
    const safeDbName = dbName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${dir}/erd_layout_${dbId}_${safeDbName}.json`;
  }

  async function loadErdLayout(dbId: string, dbName: string): Promise<Record<string, { x: number; y: number }>> {
    try {
      const path = await getErdLayoutPath(dbId, dbName);
      const content = await tauriBridge.fsReadTextFile(path);
      const parsed = JSON.parse(content);
      return parsed?.tables || {};
    } catch (e) {
      // File doesn't exist or invalid JSON
      return {};
    }
  }

  async function saveErdLayout(dbId: string, dbName: string, tables: Record<string, { x: number; y: number }>) {
    try {
      const path = await getErdLayoutPath(dbId, dbName);
      const content = JSON.stringify({ tables }, null, 2);
      await tauriBridge.fsWriteTextFile(path, content);
    } catch (e) {
      console.error('Failed to save ERD layout', e);
    }
  }

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

  async function saveSavedQuery(queryItem: DbSavedQuery) {
    if (!vaultStore.vault.db_snippets) {
      vaultStore.vault.db_snippets = [];
    }

    const idx = vaultStore.vault.db_snippets.findIndex(q => q.id === queryItem.id);
    if (idx >= 0) {
      vaultStore.vault.db_snippets[idx] = { ...queryItem };
    } else {
      vaultStore.vault.db_snippets.push({ ...queryItem });
    }

    await vaultStore.persist(true);
  }

  async function removeSavedQuery(id: string) {
    if (!vaultStore.vault.db_snippets) return;
    vaultStore.vault.db_snippets = vaultStore.vault.db_snippets.filter(q => q.id !== id);
    await vaultStore.persist(true);
  }

  function openNewModal(folderId: string | null = null) {
    editingDbConfig.value = folderId ? ({ folder_id: folderId } as any) : null;
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
    savedQueries,
    saveDatabase,
    removeDatabase,
    saveSavedQuery,
    removeSavedQuery,
    loadErdLayout,
    saveErdLayout,
    openNewModal,
    openEditModal,
    connectDatabase,
  };
});
