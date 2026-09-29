import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { VaultData, Folder, SshSessionConfig, SshKeyItem, SnippetItem } from '../types/index.js';
import { tauriBridge } from '../services/tauriBridge.js';
import { useSyncStore } from './syncStore.js';
import { safeSetItem } from '../utils/safeStorage';

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

      // Auto-heal folders containing databases if type was lost
      if (vault.value.folders && vault.value.databases) {
        for (const f of vault.value.folders) {
          if (!f.type && vault.value.databases.some(d => d.folder_id === f.id)) {
            f.type = 'db';
          }
        }
      }

      masterPassword.value = password;
      salt.value = userSalt;
      isUnlocked.value = true;
      isDirty.value = false;

      // Save encrypted local snapshot. The Rust side already persisted it; this
      // is the browser-side cache. A full origin quota must not abort unlock,
      // but the user has to be told their snapshot is not being kept.
      const cleanVault = JSON.parse(JSON.stringify(vault.value));
      const encrypted = await tauriBridge.saveLocalVault(cleanVault);
      const blobSaved = safeSetItem('boba_local_vault_blob', encrypted);
      safeSetItem('boba_user_salt', userSalt);
      if (!blobSaved) {
        console.warn(
          'BOBA: localStorage is full, the encrypted vault cache was not saved locally. ' +
            'The Rust-side vault file is unaffected. Clear old AI chat history to recover space.'
        );
      }

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
    if (!safeSetItem('boba_local_vault_blob', encrypted)) {
      // The authoritative copy is already in the Rust-side vault file, so this
      // is a lost cache rather than lost data.
      console.warn('BOBA: localStorage is full, the encrypted vault cache was not refreshed.');
    }

    // Auto-sync in background if logged in and data is modified
    if (markDirty) {
      const syncStore = useSyncStore();
      syncStore.triggerAutoSync();
    }
  }

  // Folders CRUD
  async function addFolder(name: string, parentId: string | null = null, type: 'session' | 'db' = 'session') {
    const newFolder: Folder = {
      id: `fld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      parent_id: parentId,
      type,
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
    if (vault.value.databases) {
      vault.value.databases = vault.value.databases.map(d => {
        if (d.folder_id === folderId) {
          return { ...d, folder_id: null };
        }
        return d;
      });
    }
    await persist(true);
  }

  async function setFolderType(folderId: string, type: 'session' | 'db') {
    const folder = vault.value.folders.find(f => f.id === folderId);
    if (!folder) return;
    folder.type = type;
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
    setFolderType,
    saveSession,
    removeSession,
    saveKey,
    removeKey,
    saveSnippet,
    removeSnippet,
  };
});
