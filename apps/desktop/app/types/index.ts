export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface SnippetItem {
  id: string;
  title: string;
  command: string;
  description?: string;
}

export interface SshSessionConfig {
  id: string;
  folder_id: string | null;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'key';
  password?: string;
  key_id?: string;
  sftp_auto_open: boolean;
  terminal_theme?: string;
  snippets?: SnippetItem[];
}

export interface SshKeyItem {
  id: string;
  name: string;
  private_key: string;
  passphrase?: string;
}

export interface VaultData {
  vault_version: number;
  updated_at: string;
  folders: Folder[];
  sessions: SshSessionConfig[];
  keys: SshKeyItem[];
  snippets: SnippetItem[];
}

export interface RemoteFileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_time: number;
  permissions: number;
}

export interface LocalFileItem {
  name: string;
  path: string;
  is_dir: boolean;
  is_hidden?: boolean;
  is_system?: boolean;
  size: number;
  modified_time: number;
}

export interface LocalDriveItem {
  name: string;
  path: string;
}

export interface ServerMetrics {
  cpu_usage: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_percent: number;
  disk_used: string;
  disk_total: string;
  disk_percent: number;
  uptime: string;
  load_avg: string;
}

export interface ActiveTab {
  id: string; // session ID or editor tab ID
  type?: 'terminal' | 'editor' | 'sftp';
  title: string;
  sessionConfig: SshSessionConfig;
  connected: boolean;
  error?: string;
  sftpOpen: boolean;
  currentRemotePath: string;
  parentSessionId?: string;
  metrics?: ServerMetrics;
  // Editor tab specific fields
  editorFile?: {
    path: string;
    name: string;
    content: string;
    originalContent: string;
    isDirty: boolean;
    saving: boolean;
    parentSessionId: string;
  };
}

export interface VaultSnapshot {
  vault_version: number;
  updated_at: string;
  folders: Folder[];
  sessions: SshSessionConfig[];
  keys: SshKeyItem[];
  snippets: SnippetItem[];
}
