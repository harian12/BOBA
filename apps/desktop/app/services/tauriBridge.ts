import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { VaultSnapshot, SshSessionConfig, SshKeyItem, RemoteFileItem } from '../types/index.js';

export const tauriBridge = {
  // Vault commands
  async initOrUnlockVault(masterPassword: string, userSalt: string): Promise<boolean> {
    return await invoke('init_or_unlock_vault', { masterPassword, userSalt });
  },

  async lockVault(): Promise<boolean> {
    return await invoke('lock_vault');
  },

  async isVaultUnlocked(): Promise<boolean> {
    return await invoke('is_vault_unlocked');
  },

  async saveLocalVault(snapshot: VaultSnapshot): Promise<string> {
    return await invoke('save_local_vault', { snapshot });
  },

  async decryptRemoteVaultBlob(encryptedBlob: string): Promise<VaultSnapshot> {
    return await invoke('decrypt_remote_vault_blob', { encryptedBlob });
  },

  // Sync commands
  async syncRegister(serverUrl: string, username: string, passwordHash: string, salt: string): Promise<string> {
    return await invoke('sync_register', { serverUrl, username, passwordHash, salt });
  },

  async syncLogin(serverUrl: string, username: string, passwordHash: string): Promise<{ token: string; salt: string; vault_version: number; encrypted_blob: string | null }> {
    return await invoke('sync_login', { serverUrl, username, passwordHash });
  },

  async syncPullVault(serverUrl: string, token: string): Promise<{ vault_version: number; encrypted_blob: string | null }> {
    return await invoke('sync_pull_vault', { serverUrl, token });
  },

  async syncPushVault(serverUrl: string, token: string, snapshot: VaultSnapshot, expectedVersion: number): Promise<number> {
    return await invoke('sync_push_vault', { serverUrl, token, snapshot, expectedVersion });
  },

  // SSH & SFTP commands
  async sshConnect(
    sessionId: string,
    config: SshSessionConfig,
    key?: SshKeyItem,
    cols: number = 80,
    rows: number = 24
  ): Promise<void> {
    return await invoke('ssh_connect', {
      sessionId,
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.auth_type === 'password' ? config.password || null : null,
      privateKey: config.auth_type === 'key' && key ? key.private_key : null,
      passphrase: config.auth_type === 'key' && key ? key.passphrase || null : null,
      cols,
      rows,
    });
  },

  async sshWrite(sessionId: string, data: string): Promise<void> {
    return await invoke('ssh_write', { sessionId, data });
  },

  async sshResize(sessionId: string, cols: number, rows: number): Promise<void> {
    return await invoke('ssh_resize', { sessionId, cols, rows });
  },

  async sshClose(sessionId: string): Promise<void> {
    return await invoke('ssh_close', { sessionId });
  },

  async sftpList(sessionId: string, remotePath: string): Promise<RemoteFileItem[]> {
    return await invoke('sftp_list', { sessionId, remotePath });
  },

  async sftpReadFile(sessionId: string, remotePath: string): Promise<string> {
    return await invoke('sftp_read_file', { sessionId, remotePath });
  },

  async sftpWriteFile(sessionId: string, remotePath: string, content: string): Promise<void> {
    return await invoke('sftp_write_file', { sessionId, remotePath, content });
  },

  async sftpDownloadBinary(sessionId: string, remotePath: string): Promise<string> {
    return await invoke('sftp_download_binary', { sessionId, remotePath });
  },

  async sftpUploadBinary(sessionId: string, remotePath: string, base64Data: string): Promise<void> {
    return await invoke('sftp_upload_binary', { sessionId, remotePath, base64Data });
  },

  async sftpDeletePath(sessionId: string, remotePath: string, isDir: boolean): Promise<void> {
    return await invoke('sftp_delete_path', { sessionId, remotePath, isDir });
  },

  async sftpCreateDirectory(sessionId: string, remotePath: string): Promise<void> {
    return await invoke('sftp_create_directory', { sessionId, remotePath });
  },

  async sftpRenamePath(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    return await invoke('sftp_rename_path', { sessionId, oldPath, newPath });
  },

  async sftpDownloadStream(sessionId: string, transferId: string, remotePath: string, localPath: string): Promise<void> {
    return await invoke('sftp_download_stream', { sessionId, transferId, remotePath, localPath });
  },

  async sftpUploadStream(sessionId: string, transferId: string, localPath: string, remotePath: string): Promise<void> {
    return await invoke('sftp_upload_stream', { sessionId, transferId, localPath, remotePath });
  },

  async sftpCancelTransfer(transferId: string): Promise<void> {
    return await invoke('sftp_cancel_transfer', { transferId });
  },

  async readLocalPrivateKeyFile(filePath: string): Promise<string> {
    return await invoke('read_local_private_key_file', { filePath });
  },

  async sshGetServerMetrics(sessionId: string): Promise<any> {
    return await invoke('ssh_get_server_metrics', { sessionId });
  },

  // Event listeners
  onSftpProgress(callback: (payload: any) => void): Promise<UnlistenFn> {
    return listen('sftp-progress', (event) => {
      callback(event.payload);
    });
  },

  onSshData(sessionId: string, callback: (data: string) => void): Promise<UnlistenFn> {
    return listen(`ssh-data:${sessionId}`, (event) => {
      callback(event.payload as string);
    });
  },

  onSshError(sessionId: string, callback: (error: string) => void): Promise<UnlistenFn> {
    return listen(`ssh-error:${sessionId}`, (event) => {
      callback(event.payload as string);
    });
  },

  onSshClosed(sessionId: string, callback: () => void): Promise<UnlistenFn> {
    return listen(`ssh-closed:${sessionId}`, () => {
      callback();
    });
  },
};
