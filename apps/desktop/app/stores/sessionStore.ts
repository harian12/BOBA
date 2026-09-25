import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ActiveTab, SshSessionConfig, DbConnectionConfig } from '../types/index.js';
import { tauriBridge } from '../services/tauriBridge.js';

export type GridLayoutMode = '1' | '2-col' | '2-row' | '3' | '4';

export const useSessionStore = defineStore('session', () => {
  const tabs = ref<ActiveTab[]>([]);
  const activeTabId = ref<string | null>(null);
  const layoutMode = ref<GridLayoutMode>('1');

  // Kapasitas slot grid saat ini
  const gridCapacity = computed(() => {
    if (layoutMode.value === '1') return 1;
    if (layoutMode.value === '2-col' || layoutMode.value === '2-row') return 2;
    if (layoutMode.value === '3') return 3;
    return 4;
  });

  // Hitung tab yang harus tampil di grid berdasarkan activeTabId
  const visibleTabs = computed(() => {
    if (tabs.value.length === 0) return [];
    const capacity = gridCapacity.value;
    if (capacity === 1) {
      const active = tabs.value.find(t => t.id === activeTabId.value);
      const first = tabs.value[0];
      return active ? [active] : first ? [first] : [];
    }

    const activeIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    const validIndex = activeIndex >= 0 ? activeIndex : 0;

    // Hitung page index untuk grid (misal tab ke-3 di mode 2-col akan pindah ke page 1 [tab 2, 3])
    const pageIndex = Math.floor(validIndex / capacity);
    const start = pageIndex * capacity;
    return tabs.value.slice(start, start + capacity);
  });

  const activeTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value) || null);

  function setLayoutMode(mode: GridLayoutMode) {
    layoutMode.value = mode;
  }

  function openSession(config: SshSessionConfig, forceNew = true) {
    if (!forceNew) {
      const existing = tabs.value.find(t => t.sessionConfig.id === config.id);
      if (existing) {
        activeTabId.value = existing.id;
        return;
      }
    }

    const sameSessionCount = tabs.value.filter(t => t.sessionConfig.id === config.id).length;
    const baseTitle = config.name || `${config.username}@${config.host}`;
    const tabTitle = sameSessionCount > 0 ? `${baseTitle} (${sameSessionCount + 1})` : baseTitle;

    const uniqueId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newTab: ActiveTab = {
      id: uniqueId,
      type: 'terminal',
      title: tabTitle,
      sessionConfig: { ...config },
      connected: false,
      sftpOpen: false,
      currentRemotePath: '.',
    };

    tabs.value.push(newTab);
    activeTabId.value = newTab.id;
  }

  function openEditorTab(parentTab: ActiveTab, filePath: string, fileName: string, initialContent: string) {
    // Cek jika file ini sudah pernah dibuka dari session ini
    const existing = tabs.value.find(
      t => t.type === 'editor' && t.editorFile?.path === filePath && t.editorFile?.parentSessionId === parentTab.id
    );

    if (existing) {
      activeTabId.value = existing.id;
      return;
    }

    const uniqueId = `editor_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newTab: ActiveTab = {
      id: uniqueId,
      type: 'editor',
      title: fileName,
      sessionConfig: { ...parentTab.sessionConfig },
      connected: true,
      sftpOpen: false,
      currentRemotePath: filePath,
      editorFile: {
        path: filePath,
        name: fileName,
        content: initialContent,
        originalContent: initialContent,
        isDirty: false,
        saving: false,
        parentSessionId: parentTab.id,
      },
    };

    tabs.value.push(newTab);
    activeTabId.value = newTab.id;
  }

  function openSftpTab(parentTab?: ActiveTab, customConfig?: SshSessionConfig) {
    const config = customConfig || parentTab?.sessionConfig;
    const parentId = parentTab?.id;

    if (config || parentId) {
      const existing = tabs.value.find(
        t => t.type === 'sftp' && (
          (config?.id && t.sessionConfig?.id === config.id) ||
          (parentId && t.parentSessionId === parentId)
        )
      );

      if (existing) {
        activeTabId.value = existing.id;
        return;
      }
    }

    const uniqueId = `sftp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sessionName = config?.name || (config ? `${config.username}@${config.host}` : 'Dual Transfer Workspace');

    const newTab: ActiveTab = {
      id: uniqueId,
      type: 'sftp',
      title: `SFTP: ${sessionName}`,
      sessionConfig: config ? { ...config } : ({} as any),
      connected: true,
      sftpOpen: false,
      currentRemotePath: '.',
      parentSessionId: parentId,
    };

    tabs.value.push(newTab);
    activeTabId.value = newTab.id;
  }

  function duplicateTab(tabId: string) {
    const sourceTab = tabs.value.find(t => t.id === tabId);
    if (!sourceTab) return;

    openSession(sourceTab.sessionConfig, true);
  }

  function openDbmsTab(dbConfig: DbConnectionConfig) {
    const existing = tabs.value.find(t => t.type === 'dbms' && t.dbConnection?.id === dbConfig.id);
    if (existing) {
      activeTabId.value = existing.id;
      return;
    }

    const uniqueId = `dbms_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newTab: ActiveTab = {
      id: uniqueId,
      type: 'dbms',
      title: `${dbConfig.name}`,
      sessionConfig: {
        id: dbConfig.id,
        folder_id: null,
        name: dbConfig.name,
        host: dbConfig.host || 'localhost',
        port: dbConfig.port || 3306,
        username: dbConfig.username || 'root',
        auth_type: 'password',
        sftp_auto_open: false,
      },
      connected: true,
      sftpOpen: false,
      currentRemotePath: '',
      dbConnection: dbConfig,
    };

    tabs.value.push(newTab);
    activeTabId.value = uniqueId;
  }

  async function closeTab(id: string) {
    const index = tabs.value.findIndex(t => t.id === id);
    if (index === -1) return;
    tabs.value = tabs.value.filter(t => t.id !== id);
    if (activeTabId.value === id) {
      if (tabs.value.length === 0) {
        activeTabId.value = null;
      } else {
        const nextIndex = Math.min(index, tabs.value.length - 1);
        const nextTab = tabs.value[nextIndex];
        if (nextTab) activeTabId.value = nextTab.id;
      }
    }
    // Non-blocking asynchronous cleanup on backend
    tauriBridge.sshClose(id).catch(() => {});
  }

  async function closeOtherTabs(id: string) {
    const toClose = tabs.value.filter(t => t.id !== id);
    for (const t of toClose) {
      await closeTab(t.id);
    }
  }

  function nextTab() {
    if (tabs.value.length <= 1) return;
    const currentIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (currentIndex === -1) {
      const firstTab = tabs.value[0];
      if (firstTab) activeTabId.value = firstTab.id;
    } else {
      const nextIndex = (currentIndex + 1) % tabs.value.length;
      const nextTab = tabs.value[nextIndex];
      if (nextTab) activeTabId.value = nextTab.id;
    }
  }

  function prevTab() {
    if (tabs.value.length <= 1) return;
    const currentIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (currentIndex === -1) {
      const lastTab = tabs.value[tabs.value.length - 1];
      if (lastTab) activeTabId.value = lastTab.id;
    } else {
      const prevIndex = (currentIndex - 1 + tabs.value.length) % tabs.value.length;
      const prevTab = tabs.value[prevIndex];
      if (prevTab) activeTabId.value = prevTab.id;
    }
  }

  function selectTabByIndex(index: number) {
    if (index >= 0 && index < tabs.value.length) {
      const tab = tabs.value[index];
      if (tab) activeTabId.value = tab.id;
    }
  }

  function toggleSftp(id: string) {
    const tab = tabs.value.find(t => t.id === id);
    if (tab) {
      tab.sftpOpen = !tab.sftpOpen;
    }
  }

  return {
    tabs,
    activeTabId,
    layoutMode,
    activeTab,
    visibleTabs,
    gridCapacity,
    setLayoutMode,
    openSession,
    openEditorTab,
    openSftpTab,
    openDbmsTab,
    duplicateTab,
    closeTab,
    closeOtherTabs,
    nextTab,
    prevTab,
    selectTabByIndex,
    toggleSftp,
  };
});
