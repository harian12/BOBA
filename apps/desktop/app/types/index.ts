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
  sftp_sudo?: boolean;
  sftp_sudo_command?: string;
}

export interface SshKeyItem {
  id: string;
  name: string;
  private_key: string;
  passphrase?: string;
}

export interface DbSavedQuery {
  id: string;
  title: string;
  query: string;
  engine?: string;
  db_connection_id?: string;
  db_name?: string;
  description?: string;
  createdAt: number;
}

export interface DbServerMetrics {
  engine: string;
  uptime_seconds: number;
  version: string;
  active_connections: number;
  max_connections: number;
  queries_count: number;
  memory_used_bytes?: number | null;
  memory_peak_bytes?: number | null;
  cache_hit_rate_pct?: number | null;
  extra_info: Record<string, string>;
}

export interface DbExplainResult {
  format: string;
  raw_output: string;
  warnings: string[];
  suggestions: string[];
  has_full_table_scan: boolean;
}

export interface DbProcessItem {
  id: number;
  user: string;
  host: string;
  db?: string | null;
  command: string;
  time_seconds: number;
  state?: string | null;
  info?: string | null;
}

export interface DbForeignKeyRelation {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  constraint_name?: string | null;
}

export interface DbUserItem {
  username: string;
  host: string;
  privileges: string[];
  is_superuser: boolean;
}

export interface VaultData {
  vault_version: number;
  updated_at: string;
  folders: Folder[];
  sessions: SshSessionConfig[];
  keys: SshKeyItem[];
  snippets: SnippetItem[];
  databases?: DbConnectionConfig[];
  db_snippets?: DbSavedQuery[];
}

export interface DbConnectionConfig {
  id: string;
  name: string;
  engine: 'mysql' | 'postgres' | 'sqlite' | 'redis' | 'mongodb';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  sqlite_path?: string;
  is_remote_sqlite?: boolean;
  ssh_tunnel_enabled?: boolean;
  ssh_session_id?: string;
}

export interface DbColumnMeta {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  default_value?: string | null;
}

export interface DbTableMeta {
  name: string;
  schema?: string | null;
  table_type: string; // 'TABLE' | 'VIEW' | 'COLLECTION' | 'STRING' | 'HASH' | etc
  row_count?: number | null;
  columns: DbColumnMeta[];
}

export interface DbSchemaOverview {
  databases: string[];
  current_database?: string | null;
  tables: DbTableMeta[];
}

export interface DbQueryResult {
  statement?: string;
  columns: string[];
  rows: any[][];
  affected_rows: number;
  execution_time_ms: number;
  error?: string | null;
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
  id: string; // session ID or editor/sftp/dbms tab ID
  type?: 'terminal' | 'editor' | 'sftp' | 'dbms';
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
  // DBMS tab specific fields
  dbConnection?: DbConnectionConfig;
}

export interface VaultSnapshot {
  vault_version: number;
  updated_at: string;
  folders: Folder[];
  sessions: SshSessionConfig[];
  keys: SshKeyItem[];
  snippets: SnippetItem[];
  databases?: DbConnectionConfig[];
  db_snippets?: DbSavedQuery[];
}

// AI Copilot & Server Agent Types
export type AiProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom';

export interface AiProviderConfig {
  id: string;
  name: string;
  type: AiProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  availableModels?: string[];
}

export interface AiToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  status: 'pending_approval' | 'running' | 'completed' | 'rejected' | 'failed';
  result?: any;
  error?: string;
  executedAt?: number;
}

export type AiCopilotMode = 'plan' | 'build';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: AiToolCall[];
  toolCallId?: string;
  createdAt: number;
}

export interface AiChatThread {
  id: string;
  sessionId: string;
  title: string;
  messages: AiChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ReleaseAssetInfo {
  name: string;
  size: number;
  download_url: string;
  browser_download_url: string;
}

export interface AppUpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_name: string;
  release_notes: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAssetInfo[];
}
