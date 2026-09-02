import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ActiveTab, SshSessionConfig } from '../types/index.js';
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
      return active ? [active] : [tabs.value[0]];
    }

    const activeIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    const validIndex = activeIndex >= 0 ? activeIndex : 0;

    // Hitung page index untuk grid (misal tab ke-3 di mode 2-col akan pindah ke page 1 [tab 2, 3])
    const pageIndex = Math.floor(validIndex / capacity);
    const start = pageIndex * capacity;
    return tabs.value.slice(start, start + capacity);
  });

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

  function duplicateTab(tabId: string) {
    const sourceTab = tabs.value.find(t => t.id === tabId);
    if (!sourceTab) return;

    openSession(sourceTab.sessionConfig, true);
  }

  async function closeTab(id: string) {
    await tauriBridge.sshClose(id).catch(() => {});
    const index = tabs.value.findIndex(t => t.id === id);
    tabs.value = tabs.value.filter(t => t.id !== id);
    if (activeTabId.value === id) {
      if (tabs.value.length === 0) {
        activeTabId.value = null;
      } else {
        const nextIndex = Math.min(index, tabs.value.length - 1);
        activeTabId.value = tabs.value[nextIndex].id;
      }
    }
  }

  function nextTab() {
    if (tabs.value.length <= 1) return;
    const currentIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (currentIndex === -1) {
      activeTabId.value = tabs.value[0].id;
    } else {
      const nextIndex = (currentIndex + 1) % tabs.value.length;
      activeTabId.value = tabs.value[nextIndex].id;
    }
  }

  function prevTab() {
    if (tabs.value.length <= 1) return;
    const currentIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (currentIndex === -1) {
      activeTabId.value = tabs.value[tabs.value.length - 1].id;
    } else {
      const prevIndex = (currentIndex - 1 + tabs.value.length) % tabs.value.length;
      activeTabId.value = tabs.value[prevIndex].id;
    }
  }

  function selectTabByIndex(index: number) {
    if (index >= 0 && index < tabs.value.length) {
      activeTabId.value = tabs.value[index].id;
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
    visibleTabs,
    gridCapacity,
    setLayoutMode,
    openSession,
    openEditorTab,
    duplicateTab,
    closeTab,
    nextTab,
    prevTab,
    selectTabByIndex,
    toggleSftp,
  };
});
