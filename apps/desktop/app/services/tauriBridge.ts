import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { VaultSnapshot, SshSessionConfig, SshKeyItem, RemoteFileItem, LocalFileItem, LocalDriveItem } from '../types/index.js';

export const tauriBridge = {
  // Vault commands
  async initOrUnlockVault(masterPassword: string, userSalt: string): Promise<boolean> {
    return await invoke('init_or_unlock_vault', { masterPassword, userSalt });
  },

  async changeMasterPassword(oldPassword: string, newPassword: string): Promise<boolean> {
    return await invoke('change_master_password', { oldPassword, newPassword });
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
  async syncRegister(serverUrl: string, username: string, passwordHash: string, salt: string): Promise<{ token: string; salt: string; email: string; userId: string }> {
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
      sftpSudo: config.sftp_sudo ?? false,
      sftpSudoCommand: config.sftp_sudo_command || null,
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

  async sftpDelete(sessionId: string, remotePath: string, isDir: boolean): Promise<void> {
    return await invoke('sftp_delete_path', { sessionId, remotePath, isDir });
  },

  async sftpCreateDirectory(sessionId: string, remotePath: string): Promise<void> {
    return await invoke('sftp_create_directory', { sessionId, remotePath });
  },

  async sftpCreateDir(sessionId: string, remotePath: string): Promise<void> {
    return await invoke('sftp_create_directory', { sessionId, remotePath });
  },

  async sftpRenamePath(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    return await invoke('sftp_rename_path', { sessionId, oldPath, newPath });
  },

  async sftpRename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    return await invoke('sftp_rename_path', { sessionId, oldPath, newPath });
  },

  async sftpDuplicatePath(sessionId: string, path: string, newPath: string): Promise<void> {
    return await invoke('sftp_duplicate_path', { sessionId, path, newPath });
  },

  async sftpWriteText(sessionId: string, remotePath: string, content: string): Promise<void> {
    return await invoke('sftp_write_file', { sessionId, remotePath, content });
  },

  async sftpReadText(sessionId: string, remotePath: string): Promise<string> {
    return await invoke('sftp_read_file', { sessionId, remotePath });
  },

  async sftpDownloadStream(sessionId: string, transferId: string, remotePath: string, localPath: string, resumeFrom?: number): Promise<void> {
    return await invoke('sftp_download_stream', { sessionId, transferId, remotePath, localPath, resumeFrom: resumeFrom ?? null });
  },

  async sftpUploadStream(sessionId: string, transferId: string, localPath: string, remotePath: string, resumeFrom?: number): Promise<void> {
    return await invoke('sftp_upload_stream', { sessionId, transferId, localPath, remotePath, resumeFrom: resumeFrom ?? null });
  },

  async sftpDownloadFolder(sessionId: string, remoteFolder: string, localFolder: string, concurrency?: number, transferId?: string): Promise<void> {
    return await invoke('sftp_download_folder', { sessionId, transferId: transferId || null, remoteFolder, localFolder, concurrency: concurrency || null });
  },

  async sftpUploadFolder(sessionId: string, localFolder: string, remoteFolder: string, concurrency?: number, transferId?: string): Promise<void> {
    return await invoke('sftp_upload_folder', { sessionId, transferId: transferId || null, localFolder, remoteFolder, concurrency: concurrency || null });
  },

  async sftpTransferRemoteToRemote(srcSessionId: string, dstSessionId: string, transferId: string, srcPath: string, dstPath: string, concurrency?: number): Promise<void> {
    return await invoke('sftp_transfer_remote_to_remote', { srcSessionId, dstSessionId, transferId, srcPath, dstPath, concurrency: concurrency || null });
  },

  async sftpCancelTransfer(transferId: string): Promise<void> {
    return await invoke('sftp_cancel_transfer', { transferId });
  },

  async sftpCancelAll(): Promise<void> {
    return await invoke('sftp_cancel_all');
  },

  async sftpSetConcurrency(concurrency: number): Promise<void> {
    return await invoke('sftp_set_concurrency', { concurrency });
  },

  async sftpSetSudo(sessionId: string, enable: boolean, customCommand?: string): Promise<boolean> {
    return await invoke('sftp_set_sudo', { sessionId, enable, customCommand: customCommand || null });
  },

  async sftpGetSudoStatus(sessionId: string): Promise<boolean> {
    return await invoke('sftp_get_sudo_status', { sessionId });
  },

  async sftpFixPermissions(sessionId: string, remotePath: string): Promise<string> {
    return await invoke('sftp_fix_permissions', { sessionId, remotePath });
  },

  async fsListLocalDir(dirPath: string): Promise<LocalFileItem[]> {
    return await invoke('fs_list_local_dir', { dirPath });
  },

  async fsGetLocalDrives(): Promise<LocalDriveItem[]> {
    return await invoke('fs_get_local_drives');
  },

  async fsCreateDir(dirPath: string): Promise<void> {
    return await invoke('fs_create_dir', { dirPath });
  },

  async fsCreateFile(filePath: string): Promise<void> {
    return await invoke('fs_create_file', { filePath });
  },

  async fsDeletePath(path: string, isDir: boolean): Promise<void> {
    return await invoke('fs_delete_path', { path, isDir });
  },

  async fsRenamePath(oldPath: string, newPath: string): Promise<void> {
    return await invoke('fs_rename_path', { oldPath, newPath });
  },

  async fsDuplicatePath(path: string, newPath: string, isDir: boolean): Promise<void> {
    return await invoke('fs_duplicate_path', { path, newPath, isDir });
  },

  async fsGetFolderSize(dirPath: string): Promise<number> {
    return await invoke('fs_get_folder_size', { dirPath });
  },

  async fsReadTextFile(filePath: string): Promise<string> {
    return await invoke('fs_read_text_file', { filePath });
  },

  async fsWriteTextFile(filePath: string, content: string): Promise<void> {
    return await invoke('fs_write_text_file', { filePath, content });
  },

  async readLocalPrivateKeyFile(filePath: string): Promise<string> {
    return await invoke('read_local_private_key_file', { filePath });
  },

  async sshGetServerMetrics(sessionId: string): Promise<any> {
    return await invoke('ssh_get_server_metrics', { sessionId });
  },

  async sshExecCommand(sessionId: string, command: string): Promise<string> {
    return await invoke('ssh_exec_command', { sessionId, command });
  },

  async openLogFile(): Promise<void> {
    return await invoke('open_log_file');
  },

  async readRecentLogs(): Promise<string> {
    return await invoke('read_recent_logs');
  },

  async fetchAiModels(endpoint: string, apiKey?: string): Promise<string[]> {
    return await invoke('fetch_ai_models', { endpoint, apiKey: apiKey || null });
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
