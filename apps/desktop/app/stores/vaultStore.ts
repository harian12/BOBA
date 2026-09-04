import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { VaultData, Folder, SshSessionConfig, SshKeyItem, SnippetItem } from '../types/index.js';
import { tauriBridge } from '../services/tauriBridge.js';
import { useSyncStore } from './syncStore.js';

export const useVaultStore = defineStore('vault', () => {
  const isUnlocked = ref<boolean>(false);
  const masterPassword = ref<string>('');
  const salt = ref<string>('');
  const isDirty = ref<boolean>(false);
  
  const vault = ref<VaultData>({
    vault_version: 0,
    updated_at: new Date().toISOString(),
    folders: [
      { id: 'fld-default', name: 'My Servers', parent_id: null }
    ],
    sessions: [],
    keys: [],
    snippets: [
      {
        id: 'snp-1',
        title: 'Server Resource Usage',
        command: 'top -b -n 1 | head -n 20\n',
        description: 'Check CPU & RAM status',
      },
      {
        id: 'snp-2',
        title: 'Disk Storage Info',
        command: 'df -h\n',
        description: 'View mounted disks',
      }
    ],
  });

  async function unlock(password: string, userSalt: string, encryptedBlob?: string) {
    try {
      await tauriBridge.initOrUnlockVault(password, userSalt);
      
      if (encryptedBlob) {
        const decryptedData = await tauriBridge.decryptRemoteVaultBlob(encryptedBlob);
        if (decryptedData) {
          vault.value = decryptedData;
        }
      }

      masterPassword.value = password;
      salt.value = userSalt;
      isUnlocked.value = true;
      isDirty.value = false;

      // Save encrypted local snapshot
      const cleanVault = JSON.parse(JSON.stringify(vault.value));
      const encrypted = await tauriBridge.saveLocalVault(cleanVault);
      localStorage.setItem('boba_local_vault_blob', encrypted);
      localStorage.setItem('boba_user_salt', userSalt);

      // Start periodic sync if logged in
      const syncStore = useSyncStore();
      if (syncStore.token) {
        syncStore.startPeriodicSync();
      }

      return true;
    } catch (err) {
      console.error('Unlock error:', err);
      throw err;
    }
  }

  async function changeMasterPassword(oldPassword: string, newPassword: string): Promise<boolean> {
    if (!isUnlocked.value) {
      throw new Error('Vault belum terbuka.');
    }
    await tauriBridge.changeMasterPassword(oldPassword, newPassword);
    masterPassword.value = newPassword;

    // Re-enkripsi snapshot lokal dengan password baru
    await persist(true);

    // Jika cloud sync aktif, push versi baru yang terenkripsi password baru ke cloud
    const syncStore = useSyncStore();
    if (syncStore.token) {
      await syncStore.forcePushLocal();
    }
    return true;
  }

  async function lock() {
    await tauriBridge.lockVault();
    isUnlocked.value = false;
    masterPassword.value = '';
    isDirty.value = false;
    const syncStore = useSyncStore();
    syncStore.stopPeriodicSync();
  }

  async function persist(markDirty = true) {
    if (!isUnlocked.value) return;
    vault.value.updated_at = new Date().toISOString();
    if (markDirty) {
      isDirty.value = true;
    }
    const cleanVault = JSON.parse(JSON.stringify(vault.value));
    const encrypted = await tauriBridge.saveLocalVault(cleanVault);
    localStorage.setItem('boba_local_vault_blob', encrypted);

    // Auto-sync in background if logged in and data is modified
    if (markDirty) {
      const syncStore = useSyncStore();
      syncStore.triggerAutoSync();
    }
  }

  // Folders CRUD
  async function addFolder(name: string, parentId: string | null = null) {
    const newFolder: Folder = {
      id: `fld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      parent_id: parentId,
    };
    vault.value.folders.push(newFolder);
    await persist(true);
    return newFolder;
  }

  async function removeFolder(folderId: string) {
    vault.value.folders = vault.value.folders.filter(f => f.id !== folderId);
    vault.value.sessions = vault.value.sessions.map(s => {
      if (s.folder_id === folderId) {
        return { ...s, folder_id: null };
      }
      return s;
    });
    await persist(true);
  }

  // Sessions CRUD
  async function saveSession(session: SshSessionConfig) {
    const idx = vault.value.sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      vault.value.sessions[idx] = { ...session };
    } else {
      vault.value.sessions.push({ ...session });
    }
    await persist(true);
  }

  async function removeSession(sessionId: string) {
    vault.value.sessions = vault.value.sessions.filter(s => s.id !== sessionId);
    await persist(true);
  }

  // Keys CRUD
  async function saveKey(keyItem: SshKeyItem) {
    const idx = vault.value.keys.findIndex(k => k.id === keyItem.id);
    if (idx >= 0) {
      vault.value.keys[idx] = { ...keyItem };
    } else {
      vault.value.keys.push({ ...keyItem });
    }
    await persist(true);
  }

  async function removeKey(keyId: string) {
    vault.value.keys = vault.value.keys.filter(k => k.id !== keyId);
    vault.value.sessions = vault.value.sessions.map(s => {
      if (s.key_id === keyId) {
        return { ...s, key_id: undefined };
      }
      return s;
    });
    await persist(true);
  }

  // Snippets CRUD (Global & Per-Session)
  async function saveSnippet(snippet: SnippetItem, sessionId?: string | null) {
    if (!vault.value.snippets) vault.value.snippets = [];

    if (sessionId) {
      const session = vault.value.sessions.find(s => s.id === sessionId);
      if (session) {
        if (!session.snippets) session.snippets = [];
        const idx = session.snippets.findIndex(s => s.id === snippet.id);
        if (idx >= 0) {
          session.snippets[idx] = { ...snippet };
        } else {
          session.snippets.push({ ...snippet });
        }
      } else {
        // Fallback to global if session not found in vault
        const idx = vault.value.snippets.findIndex(s => s.id === snippet.id);
        if (idx >= 0) {
          vault.value.snippets[idx] = { ...snippet };
        } else {
          vault.value.snippets.push({ ...snippet });
        }
      }
    } else {
      const idx = vault.value.snippets.findIndex(s => s.id === snippet.id);
      if (idx >= 0) {
        vault.value.snippets[idx] = { ...snippet };
      } else {
        vault.value.snippets.push({ ...snippet });
      }
    }

    await persist(true);
  }

  async function removeSnippet(snippetId: string, sessionId?: string | null) {
    if (sessionId) {
      const session = vault.value.sessions.find(s => s.id === sessionId);
      if (session && session.snippets) {
        session.snippets = session.snippets.filter(s => s.id !== snippetId);
      }
    }
    if (vault.value.snippets) {
      vault.value.snippets = vault.value.snippets.filter(s => s.id !== snippetId);
    }
    await persist(true);
  }

  return {
    isUnlocked,
    masterPassword,
    salt,
    vault,
    isDirty,
    unlock,
    lock,
    changeMasterPassword,
    persist,
    addFolder,
    removeFolder,
    saveSession,
    removeSession,
    saveKey,
    removeKey,
    saveSnippet,
    removeSnippet,
  };
});
