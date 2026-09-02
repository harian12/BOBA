import { defineStore } from 'pinia';
import { ref } from 'vue';
import { tauriBridge } from '../services/tauriBridge.js';
import { useVaultStore } from './vaultStore.js';
import type { VaultSnapshot } from '../types/index.js';

export const useSyncStore = defineStore('sync', () => {
  const serverUrl = ref<string>(localStorage.getItem('boba_server_url') || 'http://localhost:8787');
  const token = ref<string>(localStorage.getItem('boba_auth_token') || '');
  const userEmail = ref<string>(localStorage.getItem('boba_user_email') || '');
  const userId = ref<string>(localStorage.getItem('boba_user_id') || '');
  const userSalt = ref<string>(localStorage.getItem('boba_user_salt') || '');
  
  const isSyncing = ref(false);
  const lastSyncTime = ref<string | null>(localStorage.getItem('boba_last_sync_time') || null);
  const syncError = ref<string | null>(null);
  const hasConflict = ref(false);

  let debounceTimer: any = null;
  let periodicTimer: any = null;

  function setServerUrl(url: string) {
    serverUrl.value = url;
    localStorage.setItem('boba_server_url', url);
  }

  async function register(email: string, passwordHash: string) {
    syncError.value = null;
    try {
      const generatedSalt = Math.random().toString(36).substring(2, 18);
      const resToken = await tauriBridge.syncRegister(
        serverUrl.value,
        email,
        passwordHash,
        generatedSalt
      );
      
      token.value = resToken;
      userEmail.value = email;
      userSalt.value = generatedSalt;

      localStorage.setItem('boba_auth_token', token.value);
      localStorage.setItem('boba_user_email', userEmail.value);
      localStorage.setItem('boba_user_salt', userSalt.value);

      const vaultStore = useVaultStore();
      const activePassword = passwordHash || vaultStore.masterPassword;
      if (activePassword) {
        await tauriBridge.initOrUnlockVault(activePassword, userSalt.value);
        vaultStore.masterPassword = activePassword;
        vaultStore.salt = userSalt.value;
      }

      startPeriodicSync();
      return true;
    } catch (err: any) {
      syncError.value = String(err);
      throw err;
    }
  }

  async function login(email: string, passwordHash: string) {
    syncError.value = null;
    try {
      const res: any = await tauriBridge.syncLogin(serverUrl.value, email, passwordHash);
      token.value = res.token;
      userEmail.value = res.email || email;
      userId.value = res.userId || '';
      userSalt.value = res.salt || '';

      localStorage.setItem('boba_auth_token', token.value);
      localStorage.setItem('boba_user_email', userEmail.value);
      if (res.salt) localStorage.setItem('boba_user_salt', userSalt.value);

      const vaultStore = useVaultStore();
      // Re-init / update master key in Rust backend with cloud account salt and password
      const activePassword = passwordHash || vaultStore.masterPassword;
      if (activePassword) {
        await tauriBridge.initOrUnlockVault(activePassword, userSalt.value || 'boba_default_offline_salt_123');
        vaultStore.masterPassword = activePassword;
        vaultStore.salt = userSalt.value;
      }

      // Auto-pull remote vault after login
      await forcePullRemote();
      startPeriodicSync();

      return true;
    } catch (err: any) {
      syncError.value = String(err);
      throw err;
    }
  }

  function logout() {
    stopPeriodicSync();
    token.value = '';
    userEmail.value = '';
    userId.value = '';
    localStorage.removeItem('boba_auth_token');
    localStorage.removeItem('boba_user_email');
    localStorage.removeItem('boba_user_id');
  }

  async function forcePullRemote() {
    if (!token.value) return;
    const vaultStore = useVaultStore();
    if (!vaultStore.isUnlocked) return;

    isSyncing.value = true;
    syncError.value = null;
    try {
      const pullRes: any = await tauriBridge.syncPullVault(serverUrl.value, token.value);
      if (pullRes && pullRes.encryptedData) {
        const remoteVault = await tauriBridge.decryptRemoteVaultBlob(pullRes.encryptedData);
        if (remoteVault) {
          vaultStore.vault = remoteVault;
          vaultStore.vault.vault_version = pullRes.version || 0;
          vaultStore.isDirty = false;
          await vaultStore.persist(false);
        }
      }
      const now = new Date().toLocaleTimeString();
      lastSyncTime.value = now;
      localStorage.setItem('boba_last_sync_time', now);
      hasConflict.value = false;
    } catch (err: any) {
      const errStr = String(err);
      if (errStr.includes('aead::Error') || errStr.includes('Decryption error')) {
        syncError.value = 'Master Password lokal tidak cocok untuk mendekripsi data server.';
      } else {
        syncError.value = 'Gagal menarik data dari server: ' + errStr;
      }
    } finally {
      isSyncing.value = false;
    }
  }

  async function syncVault() {
    if (!token.value) return;
    const vaultStore = useVaultStore();
    if (!vaultStore.isUnlocked) return;

    isSyncing.value = true;
    syncError.value = null;
    hasConflict.value = false;

    try {
      // 1. Pull metadata dari remote
      const pullRes: any = await tauriBridge.syncPullVault(serverUrl.value, token.value);
      const remoteVersion = pullRes ? (pullRes.version || 0) : 0;

      // Kasus 1: Lokal ada perubahan baru (isDirty) -> PUSH ke server
      if (vaultStore.isDirty || (vaultStore.vault.sessions.length > 0 && remoteVersion === 0)) {
        const cleanVault = JSON.parse(JSON.stringify(vaultStore.vault));
        const newVersion = await tauriBridge.syncPushVault(
          serverUrl.value,
          token.value,
          cleanVault,
          remoteVersion
        );
        vaultStore.vault.vault_version = newVersion;
        vaultStore.isDirty = false;
        await vaultStore.persist(false);
      } 
      // Kasus 2: Server lebih baru dan lokal tidak diubah -> PULL dari server
      else if (pullRes && pullRes.encryptedData && remoteVersion > vaultStore.vault.vault_version) {
        const remoteVault = await tauriBridge.decryptRemoteVaultBlob(pullRes.encryptedData);
        if (remoteVault) {
          vaultStore.vault = remoteVault;
          vaultStore.vault.vault_version = remoteVersion;
          vaultStore.isDirty = false;
          await vaultStore.persist(false);
        }
      }
      // Kasus 3: Jika lokal kosong dan server memiliki data -> PULL
      else if (vaultStore.vault.sessions.length === 0 && pullRes && pullRes.encryptedData) {
        const remoteVault = await tauriBridge.decryptRemoteVaultBlob(pullRes.encryptedData);
        if (remoteVault) {
          vaultStore.vault = remoteVault;
          vaultStore.vault.vault_version = remoteVersion;
          vaultStore.isDirty = false;
          await vaultStore.persist(false);
        }
      }

      const now = new Date().toLocaleTimeString();
      lastSyncTime.value = now;
      localStorage.setItem('boba_last_sync_time', now);
    } catch (err: any) {
      const errStr = String(err);
      if (errStr.includes('VERSION_CONFLICT') || errStr.includes('CONFLICT')) {
        hasConflict.value = true;
        syncError.value = 'Versi di server telah berubah dari device lain.';
      } else if (errStr.includes('aead::Error') || errStr.includes('Decryption error')) {
        syncError.value = 'Master Password tidak cocok dengan data server.';
      } else {
        syncError.value = errStr;
      }
    } finally {
      isSyncing.value = false;
    }
  }

  // Trigger background auto-sync with debouncing
  function triggerAutoSync(debounceMs = 1500) {
    if (!token.value) return;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      syncVault();
    }, debounceMs);
  }

  // Background sync loop (check remote changes every 30s)
  function startPeriodicSync() {
    stopPeriodicSync();
    if (!token.value) return;
    periodicTimer = setInterval(() => {
      syncVault();
    }, 30000);
  }

  function stopPeriodicSync() {
    if (periodicTimer) {
      clearInterval(periodicTimer);
      periodicTimer = null;
    }
  }

  async function forcePushLocal() {
    if (!token.value) return;
    const vaultStore = useVaultStore();
    if (!vaultStore.isUnlocked) return;

    isSyncing.value = true;
    syncError.value = null;
    try {
      const pullRes: any = await tauriBridge.syncPullVault(serverUrl.value, token.value).catch(() => ({ version: 0 }));
      const expectedVersion = pullRes ? (pullRes.version || 0) : 0;

      const cleanVault = JSON.parse(JSON.stringify(vaultStore.vault));
      const newVersion = await tauriBridge.syncPushVault(
        serverUrl.value,
        token.value,
        cleanVault,
        expectedVersion
      );

      vaultStore.vault.vault_version = newVersion;
      vaultStore.isDirty = false;
      await vaultStore.persist(false);
      hasConflict.value = false;

      const now = new Date().toLocaleTimeString();
      lastSyncTime.value = now;
      localStorage.setItem('boba_last_sync_time', now);
    } catch (err: any) {
      syncError.value = String(err);
    } finally {
      isSyncing.value = false;
    }
  }

  return {
    serverUrl,
    token,
    userEmail,
    userId,
    userSalt,
    isSyncing,
    lastSyncTime,
    syncError,
    hasConflict,
    setServerUrl,
    register,
    login,
    logout,
    syncVault,
    syncNow: syncVault,
    triggerAutoSync,
    startPeriodicSync,
    stopPeriodicSync,
    forcePullRemote,
    forcePushLocal,
  };
});
