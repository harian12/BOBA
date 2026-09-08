import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AiProviderConfig, AiChatMessage, AiToolCall } from '../types/index.js';
import { streamChat } from '../services/aiAdapters.js';
import { tauriBridge } from '../services/tauriBridge.js';
import { useSessionStore } from './sessionStore.js';
import { useVaultStore } from './vaultStore.js';
import { useDialogStore } from './dialogStore.js';

export const useAiAgentStore = defineStore('aiAgent', () => {
  const sessionStore = useSessionStore();
  const vaultStore = useVaultStore();
  const dialogStore = useDialogStore();

  const providers = ref<AiProviderConfig[]>([]);
  const activeProviderId = ref<string>('');
  const isDrawerOpen = ref<boolean>(false);
  const isProviderModalOpen = ref<boolean>(false);
  const executionMode = ref<'confirm' | 'auto'>('confirm');

  function openProviderModal() {
    isProviderModalOpen.value = true;
  }

  function closeProviderModal() {
    isProviderModalOpen.value = false;
  }
  const selectedSessionId = ref<string>('');
  const messages = ref<Record<string, AiChatMessage[]>>({});
  const isThinking = ref<boolean>(false);
  let activeAbortController: AbortController | null = null;

  // Load persisted configuration
  function init() {
    if (typeof window === 'undefined') return;
    try {
      const savedProviders = localStorage.getItem('boba_ai_providers');
      if (savedProviders) {
        providers.value = JSON.parse(savedProviders);
      } else {
        // Sample default providers
        providers.value = [
          {
            id: 'openai_default',
            name: 'OpenAI (ChatGPT)',
            type: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: '',
            model: 'gpt-4o',
          },
          {
            id: 'deepseek_default',
            name: 'DeepSeek',
            type: 'custom',
            baseUrl: 'https://api.deepseek.com/v1',
            apiKey: '',
            model: 'deepseek-chat',
          },
          {
            id: 'ollama_default',
            name: 'Ollama (Lokal)',
            type: 'ollama',
            baseUrl: 'http://localhost:11434',
            apiKey: '',
            model: 'qwen2.5-coder:7b',
          },
        ];
      }

      const savedActive = localStorage.getItem('boba_ai_active_provider');
      if (savedActive && providers.value.some(p => p.id === savedActive)) {
        activeProviderId.value = savedActive;
      } else if (providers.value.length > 0) {
        activeProviderId.value = providers.value[0].id;
      }

      const savedMode = localStorage.getItem('boba_ai_exec_mode');
      if (savedMode === 'confirm' || savedMode === 'auto') {
        executionMode.value = savedMode;
      }

      const savedMessages = localStorage.getItem('boba_ai_chat_history');
      if (savedMessages) {
        messages.value = JSON.parse(savedMessages);
      }
    } catch (e) {
      console.warn('Failed to load AI agent settings:', e);
    }
  }

  init();

  function saveState() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('boba_ai_providers', JSON.stringify(providers.value));
      localStorage.setItem('boba_ai_active_provider', activeProviderId.value);
      localStorage.setItem('boba_ai_exec_mode', executionMode.value);
      // Simpan maksimal 30 pesan terakhir per sesi agar storage tidak penuh
      const trimmed: Record<string, AiChatMessage[]> = {};
      for (const [k, v] of Object.entries(messages.value)) {
        trimmed[k] = v.slice(-30);
      }
      localStorage.setItem('boba_ai_chat_history', JSON.stringify(trimmed));
    } catch (_) {}
  }

  const activeProvider = computed<AiProviderConfig | null>(() => {
    return providers.value.find(p => p.id === activeProviderId.value) || null;
  });

  const connectedAiSessions = new Set<string>();

  function syncActiveSessionFromTabs() {
    const activeTab = sessionStore.tabs.find(t => t.id === sessionStore.activeTabId);
    if (activeTab?.sessionConfig?.id) {
      selectedSessionId.value = activeTab.sessionConfig.id;
    } else if (activeTab?.parentSessionId) {
      selectedSessionId.value = activeTab.parentSessionId;
    } else if (!selectedSessionId.value && vaultStore.vault.sessions.length > 0) {
      selectedSessionId.value = vaultStore.vault.sessions[0].id;
    }
  }

  async function ensureSessionConnected(sessionId: string): Promise<string> {
    if (!sessionId) {
      throw new Error('Target server belum dipilih.');
    }

    // 1. Cek apakah ada tab terminal aktif yang sudah terhubung dengan session ID ini
    const activeTab = sessionStore.tabs.find(
      t => t.type === 'terminal' && (t.sessionConfig?.id === sessionId || t.id === sessionId) && t.connected
    );
    if (activeTab) {
      return activeTab.id;
    }

    // 2. Cek apakah sesi AI ini sudah pernah kita koneksikan di background
    const aiSessId = `ai_${sessionId}`;
    if (connectedAiSessions.has(aiSessId)) {
      return aiSessId;
    }

    // 3. Ambil konfigurasi server dari Vault
    const config = vaultStore.vault.sessions.find(s => s.id === sessionId);
    if (!config) {
      throw new Error(`Sesi server dengan ID "${sessionId}" tidak ditemukan di Vault.`);
    }

    let keyItem = undefined;
    if (config.auth_type === 'key' && config.key_id) {
      keyItem = vaultStore.vault.keys.find(k => k.id === config.key_id);
    }

    dialogStore.showToast(`Menghubungkan background SSH: ${config.name} (${config.host})...`, 'info', 2000);
    await tauriBridge.sshConnect(
      aiSessId,
      config,
      keyItem,
      80,
      24
    );
    connectedAiSessions.add(aiSessId);
    return aiSessId;
  }

  function toggleDrawer() {
    isDrawerOpen.value = !isDrawerOpen.value;
    if (isDrawerOpen.value) {
      syncActiveSessionFromTabs();
    }
  }

  function openDrawer(sessionId?: string) {
    isDrawerOpen.value = true;
    if (sessionId) {
      selectedSessionId.value = sessionId;
    } else {
      syncActiveSessionFromTabs();
    }
  }

  async function sendPromptWithContext(promptText: string, sessionId?: string) {
    openDrawer(sessionId);
    await sendMessage(promptText);
  }

  function closeDrawer() {
    isDrawerOpen.value = false;
  }

  function saveProvider(config: AiProviderConfig) {
    const idx = providers.value.findIndex(p => p.id === config.id);
    if (idx >= 0) {
      providers.value[idx] = { ...config };
    } else {
      providers.value.push({ ...config });
    }
    if (!activeProviderId.value) {
      activeProviderId.value = config.id;
    }
    saveState();
  }

  function deleteProvider(id: string) {
    providers.value = providers.value.filter(p => p.id !== id);
    if (activeProviderId.value === id) {
      activeProviderId.value = providers.value.length > 0 ? providers.value[0].id : '';
    }
    saveState();
  }

  function setActiveProvider(id: string) {
    activeProviderId.value = id;
    saveState();
  }

  function setExecutionMode(mode: 'confirm' | 'auto') {
    executionMode.value = mode;
    saveState();
  }

  function getSessionMessages(sessionId: string): AiChatMessage[] {
    const key = sessionId || 'default';
    if (!messages.value[key]) {
      messages.value[key] = [];
    }
    return messages.value[key];
  }

  function clearMessages(sessionId: string) {
    const key = sessionId || 'default';
    messages.value[key] = [];
    saveState();
  }

  function isDangerousCommand(cmd: string): boolean {
    const lower = cmd.trim().toLowerCase();
    const dangerousPatterns = [
      /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+\//, // rm -rf /
      /\brm\s+-[a-zA-Z]*f[a-zA-Z]*r?\s+\//,
      /\bmkfs\b/,
      /\bfdisk\b/,
      /\bparted\b/,
      /\bdd\s+if=/,
      /\bshutdown\b/,
      /\breboot\b/,
      /\bpasswd\b/,
      /\bchmod\s+-R\s+777\s+\//,
    ];
    return dangerousPatterns.some(pattern => pattern.test(lower));
  }

  // Eksekusi tool call ke server target
  async function executeTool(sessionId: string, toolCall: AiToolCall): Promise<any> {
    toolCall.status = 'running';

    try {
      const realSessionId = await ensureSessionConnected(sessionId);

      if (toolCall.name === 'exec_command') {
        const cmd = toolCall.args.command;
        if (!cmd) throw new Error('Perintah (command) kosong');
        const output = await tauriBridge.sshExecCommand(realSessionId, cmd);
        toolCall.result = output;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return output;
      } else if (toolCall.name === 'read_file') {
        const path = toolCall.args.path;
        if (!path) throw new Error('Path file kosong');
        const content = await tauriBridge.sftpReadText(realSessionId, path);
        toolCall.result = content;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return content;
      } else if (toolCall.name === 'write_file') {
        const { path, content } = toolCall.args;
        if (!path) throw new Error('Path file kosong');
        // Buat backup file lama jika ada
        try {
          const oldContent = await tauriBridge.sftpReadText(realSessionId, path);
          if (oldContent) {
            await tauriBridge.sftpWriteText(realSessionId, `${path}.boba.bak`, oldContent);
          }
        } catch (_) {}
        await tauriBridge.sftpWriteText(realSessionId, path, content || '');
        const msg = `File "${path}" berhasil disimpan. Backup tersimpan di "${path}.boba.bak".`;
        toolCall.result = msg;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return msg;
      } else if (toolCall.name === 'get_system_metrics') {
        const metrics = await tauriBridge.sshGetServerMetrics(realSessionId);
        toolCall.result = metrics;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return metrics;
      } else {
        throw new Error(`Tool "${toolCall.name}" tidak dikenali`);
      }
    } catch (err: any) {
      toolCall.error = String(err);
      toolCall.status = 'failed';
      throw err;
    }
  }

  async function approveToolCall(toolCallId: string) {
    const key = selectedSessionId.value || 'default';
    const list = messages.value[key] || [];
    for (const msg of list) {
      const tc = msg.toolCalls?.find(t => t.id === toolCallId);
      if (tc && tc.status === 'pending_approval') {
        try {
          const result = await executeTool(selectedSessionId.value, tc);
          saveState();
          // Masukkan tool result ke riwayat pesan dan picu AI untuk analisis lanjutan
          list.push({
            id: `msg_tool_${Date.now()}`,
            role: 'tool',
            toolCallId: tc.id,
            content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            createdAt: Date.now(),
          });
          saveState();
          await continueAgentLoop(selectedSessionId.value);
        } catch (e: any) {
          list.push({
            id: `msg_tool_err_${Date.now()}`,
            role: 'tool',
            toolCallId: tc.id,
            content: `Error executing ${tc.name}: ${e}`,
            createdAt: Date.now(),
          });
          saveState();
        }
        break;
      }
    }
  }

  function rejectToolCall(toolCallId: string) {
    const key = selectedSessionId.value || 'default';
    const list = messages.value[key] || [];
    for (const msg of list) {
      const tc = msg.toolCalls?.find(t => t.id === toolCallId);
      if (tc && tc.status === 'pending_approval') {
        tc.status = 'rejected';
        list.push({
          id: `msg_tool_rej_${Date.now()}`,
          role: 'tool',
          toolCallId: tc.id,
          content: 'User membatalkan/menolak eksekusi aksi ini.',
          createdAt: Date.now(),
        });
        saveState();
        break;
      }
    }
  }

  function stopThinking() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    isThinking.value = false;
  }

  function buildSystemPrompt(sessionId: string): string {
    const session = vaultStore.vault.sessions.find(s => s.id === sessionId);
    const hostInfo = session ? `Host: ${session.username}@${session.host}:${session.port} (${session.name})` : 'No active session attached';

    return `You are BOBA AI Server Copilot, an elite Senior DevOps Engineer and Linux System Administrator assistant.
Current Target Server: ${hostInfo}

You have access to tools to inspect and configure the server:
- exec_command: execute bash commands to inspect status, logs, packages, services, network, or perform configuration.
- read_file: read full text of configuration files or logs.
- write_file: update or create configuration files (a backup will be made automatically).
- get_system_metrics: check current CPU, RAM, Disk, and load average.

Guidelines:
1. Always analyze server status first before changing files or restarting services.
2. Be concise, direct, and explain clearly why a command or config change is needed.
3. Respond in Bahasa Indonesia with technical terms in English (e.g. "Berikut hasil pengecekan log Nginx:").
4. If asked to fix a problem, explain your diagnosis, use tools to gather facts, and then apply fixes.`;
  }

  async function sendMessage(promptText: string) {
    const provider = activeProvider.value;
    if (!provider) {
      dialogStore.alert({
        title: 'Provider AI Belum Dipilih',
        description: 'Silakan tambahkan atau pilih Provider AI (OpenAI, Claude, Gemini, atau Ollama) terlebih dahulu.',
        variant: 'warning',
      });
      isProviderModalOpen.value = true;
      return;
    }

    if (!provider.apiKey && provider.type !== 'ollama') {
      dialogStore.alert({
        title: 'API Key Belum Diisi',
        description: `Silakan isi API Key untuk provider ${provider.name} di pengaturan.`,
        variant: 'warning',
      });
      isProviderModalOpen.value = true;
      return;
    }

    const key = selectedSessionId.value || 'default';
    if (!messages.value[key]) messages.value[key] = [];
    const chatList = messages.value[key];

    // Push User message
    chatList.push({
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: promptText.trim(),
      createdAt: Date.now(),
    });
    saveState();

    await continueAgentLoop(selectedSessionId.value);
  }

  async function continueAgentLoop(sessionId: string) {
    const provider = activeProvider.value;
    if (!provider) return;
    const key = sessionId || 'default';
    const chatList = messages.value[key] || [];

    isThinking.value = true;
    activeAbortController = new AbortController();

    // Create assistant placeholder message
    const assistantMsg: AiChatMessage = {
      id: `msg_ai_${Date.now()}`,
      role: 'assistant',
      content: '',
      toolCalls: [],
      createdAt: Date.now(),
    };
    chatList.push(assistantMsg);
    saveState();

    const systemPrompt = buildSystemPrompt(sessionId);

    try {
      await streamChat(
        provider,
        chatList.slice(0, -1), // exclude current empty assistant message
        systemPrompt,
        {
          onToken: (token: string) => {
            assistantMsg.content += token;
          },
          onToolCalls: (tcs: AiToolCall[]) => {
            assistantMsg.toolCalls = tcs;
            saveState();
          },
          onError: (err: any) => {
            assistantMsg.content += `\n\n⚠️ Error: ${err.message || String(err)}`;
            saveState();
          },
          onFinish: async () => {
            saveState();
            isThinking.value = false;
            activeAbortController = null;

            // Cek apakah ada tool calls yang dihasilkan
            if (assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0) {
              if (executionMode.value === 'auto') {
                // Eksekusi otomatis jika BUKAN perintah berbahaya
                for (const tc of assistantMsg.toolCalls) {
                  if (tc.name === 'exec_command' && isDangerousCommand(tc.args.command || '')) {
                    tc.status = 'pending_approval'; // Tahan untuk persetujuan manual demi keamanan
                    dialogStore.showToast('Perintah berisiko tinggi memerlukan persetujuan manual', 'warning', 3000);
                  } else {
                    await approveToolCall(tc.id);
                  }
                }
              }
            }
          },
        },
        activeAbortController.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        assistantMsg.content += `\n\n⚠️ Connection Error: ${err.message || String(err)}`;
      }
      isThinking.value = false;
      activeAbortController = null;
      saveState();
    }
  }

  return {
    providers,
    activeProviderId,
    activeProvider,
    isDrawerOpen,
    isProviderModalOpen,
    openProviderModal,
    closeProviderModal,
    executionMode,
    selectedSessionId,
    messages,
    isThinking,
    toggleDrawer,
    openDrawer,
    closeDrawer,
    saveProvider,
    deleteProvider,
    setActiveProvider,
    setExecutionMode,
    getSessionMessages,
    clearMessages,
    sendMessage,
    sendPromptWithContext,
    ensureSessionConnected,
    approveToolCall,
    rejectToolCall,
    stopThinking,
  };
});
