import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AiProviderConfig, AiChatMessage, AiToolCall, AiChatThread } from '../types/index.js';
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
  const threads = ref<AiChatThread[]>([]);
  const activeThreadId = ref<string>('');
  const activeThreadPerSession = ref<Record<string, string>>({});
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

      // Load thread histories per session
      const savedThreads = localStorage.getItem('boba_ai_chat_threads');
      if (savedThreads) {
        threads.value = JSON.parse(savedThreads);
      } else {
        // Migrasi riwayat lama ke model threads
        const savedMessages = localStorage.getItem('boba_ai_chat_history');
        if (savedMessages) {
          try {
            const legacy: Record<string, AiChatMessage[]> = JSON.parse(savedMessages);
            for (const [sid, msgs] of Object.entries(legacy)) {
              if (msgs && msgs.length > 0) {
                const userMsg = msgs.find(m => m.role === 'user');
                const title = userMsg ? (userMsg.content.slice(0, 36) + (userMsg.content.length > 36 ? '...' : '')) : 'Percakapan Sebelumnya';
                threads.value.push({
                  id: `th_${sid}_${Date.now()}`,
                  sessionId: sid,
                  title,
                  messages: msgs,
                  createdAt: msgs[0]?.createdAt || Date.now(),
                  updatedAt: msgs[msgs.length - 1]?.createdAt || Date.now(),
                });
              }
            }
          } catch (_) {}
        }
      }

      const savedActivePerSession = localStorage.getItem('boba_ai_active_threads');
      if (savedActivePerSession) {
        try {
          activeThreadPerSession.value = JSON.parse(savedActivePerSession);
        } catch (_) {}
      }

      // Sync legacy messages map for backwards compatibility
      const legacyMap: Record<string, AiChatMessage[]> = {};
      for (const t of threads.value) {
        if (!legacyMap[t.sessionId] || activeThreadPerSession.value[t.sessionId] === t.id) {
          legacyMap[t.sessionId] = t.messages;
        }
      }
      messages.value = legacyMap;
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

      // Simpan maksimal 60 thread, dan maksimal 40 pesan terakhir per thread
      const trimmedThreads = threads.value.slice(0, 60).map(t => ({
        ...t,
        messages: t.messages.slice(-40),
      }));
      localStorage.setItem('boba_ai_chat_threads', JSON.stringify(trimmedThreads));
      localStorage.setItem('boba_ai_active_threads', JSON.stringify(activeThreadPerSession.value));

      // Sync legacy messages map for backwards compatibility
      const legacyMap: Record<string, AiChatMessage[]> = {};
      for (const t of threads.value) {
        if (!legacyMap[t.sessionId] || activeThreadPerSession.value[t.sessionId] === t.id) {
          legacyMap[t.sessionId] = t.messages;
        }
      }
      messages.value = legacyMap;
      localStorage.setItem('boba_ai_chat_history', JSON.stringify(legacyMap));
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

  function getOrCreateActiveThread(sessionId?: string): AiChatThread {
    const sid = sessionId || selectedSessionId.value || 'default';
    const currentId = activeThreadPerSession.value[sid];
    let thread = threads.value.find(t => t.id === currentId && t.sessionId === sid);

    if (!thread) {
      // Ambil thread paling baru untuk sesi server ini jika ada
      thread = threads.value
        .filter(t => t.sessionId === sid)
        .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))[0];

      if (!thread) {
        thread = {
          id: `th_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sessionId: sid,
          title: 'Percakapan Baru',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        threads.value.unshift(thread);
      }
      activeThreadPerSession.value[sid] = thread.id;
    }

    activeThreadId.value = thread.id;
    return thread;
  }

  const activeThread = computed<AiChatThread | null>(() => {
    const sid = selectedSessionId.value || 'default';
    const currentId = activeThreadPerSession.value[sid] || activeThreadId.value;
    return threads.value.find(t => t.id === currentId) || threads.value.find(t => t.sessionId === sid) || null;
  });

  const currentSessionThreads = computed<AiChatThread[]>(() => {
    const sid = selectedSessionId.value || 'default';
    return threads.value
      .filter(t => t.sessionId === sid)
      .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  });

  function createNewThread(sessionId?: string): string {
    const sid = sessionId || selectedSessionId.value || 'default';
    const active = activeThread.value;
    // Jika thread aktif saat ini sudah kosong belum ada percakapan, gunakan saja thread ini
    if (active && active.sessionId === sid && active.messages.length === 0) {
      return active.id;
    }

    const newThread: AiChatThread = {
      id: `th_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId: sid,
      title: 'Percakapan Baru',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    threads.value.unshift(newThread);
    activeThreadPerSession.value[sid] = newThread.id;
    activeThreadId.value = newThread.id;
    saveState();
    return newThread.id;
  }

  function switchThread(threadId: string) {
    const target = threads.value.find(t => t.id === threadId);
    if (!target) return;
    activeThreadId.value = target.id;
    activeThreadPerSession.value[target.sessionId] = target.id;
    selectedSessionId.value = target.sessionId;
    saveState();
  }

  function deleteThread(threadId: string) {
    const idx = threads.value.findIndex(t => t.id === threadId);
    if (idx === -1) return;
    const [deleted] = threads.value.splice(idx, 1);
    const sid = deleted.sessionId;

    if (activeThreadPerSession.value[sid] === threadId) {
      delete activeThreadPerSession.value[sid];
      const remaining = threads.value
        .filter(t => t.sessionId === sid)
        .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

      if (remaining.length > 0) {
        activeThreadPerSession.value[sid] = remaining[0].id;
        if (selectedSessionId.value === sid) {
          activeThreadId.value = remaining[0].id;
        }
      } else if (selectedSessionId.value === sid) {
        createNewThread(sid);
      }
    }
    saveState();
  }

  function clearThreadMessages(threadId: string) {
    const thread = threads.value.find(t => t.id === threadId);
    if (thread) {
      thread.messages = [];
      thread.title = 'Percakapan Baru';
      thread.updatedAt = Date.now();
      saveState();
    }
  }

  function getSessionMessages(sessionId: string): AiChatMessage[] {
    const sid = sessionId || selectedSessionId.value || 'default';
    const thread = getOrCreateActiveThread(sid);
    return thread ? thread.messages : [];
  }

  function clearMessages(sessionId: string) {
    const sid = sessionId || selectedSessionId.value || 'default';
    const thread = getOrCreateActiveThread(sid);
    if (thread) {
      thread.messages = [];
      thread.title = 'Percakapan Baru';
      thread.updatedAt = Date.now();
      saveState();
    }
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

    // Normalisasi nama tool jika terduplikasi saat chunk streaming
    const validToolNames = ['exec_command', 'read_file', 'write_file', 'get_system_metrics'];
    for (const v of validToolNames) {
      if (toolCall.name.startsWith(v)) {
        toolCall.name = v;
        break;
      }
    }

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
    const thread = getOrCreateActiveThread(selectedSessionId.value);
    const list = thread.messages;
    for (const msg of list) {
      const tc = msg.toolCalls?.find(t => t.id === toolCallId);
      if (tc && tc.status === 'pending_approval') {
        try {
          const result = await executeTool(selectedSessionId.value, tc);
          // Masukkan tool result ke riwayat pesan dan picu AI untuk analisis lanjutan
          list.push({
            id: `msg_tool_${Date.now()}`,
            role: 'tool',
            toolCallId: tc.id,
            content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            createdAt: Date.now(),
          });
          thread.updatedAt = Date.now();
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
          thread.updatedAt = Date.now();
          saveState();
        }
        break;
      }
    }
  }

  function rejectToolCall(toolCallId: string) {
    const thread = getOrCreateActiveThread(selectedSessionId.value);
    const list = thread.messages;
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
        thread.updatedAt = Date.now();
        saveState();
        break;
      }
    }
  }

  async function retryToolCall(toolCallId: string) {
    const thread = getOrCreateActiveThread(selectedSessionId.value);
    const list = thread.messages;
    for (const msg of list) {
      const tc = msg.toolCalls?.find(t => t.id === toolCallId);
      if (tc) {
        tc.status = 'running';
        tc.error = undefined;
        tc.result = undefined;
        thread.updatedAt = Date.now();
        saveState();

        try {
          const result = await executeTool(selectedSessionId.value, tc);

          const existingToolMsg = list.find(m => m.role === 'tool' && m.toolCallId === tc.id);
          const toolContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          if (existingToolMsg) {
            existingToolMsg.content = toolContent;
          } else {
            list.push({
              id: `msg_tool_${Date.now()}`,
              role: 'tool',
              toolCallId: tc.id,
              content: toolContent,
              createdAt: Date.now(),
            });
          }
          thread.updatedAt = Date.now();
          saveState();
          await continueAgentLoop(selectedSessionId.value);
        } catch (e: any) {
          const existingToolMsg = list.find(m => m.role === 'tool' && m.toolCallId === tc.id);
          const errContent = `Error executing ${tc.name}: ${e.message || String(e)}`;
          if (existingToolMsg) {
            existingToolMsg.content = errContent;
          } else {
            list.push({
              id: `msg_tool_err_${Date.now()}`,
              role: 'tool',
              toolCallId: tc.id,
              content: errContent,
              createdAt: Date.now(),
            });
          }
          thread.updatedAt = Date.now();
          saveState();
        }
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

    const sid = selectedSessionId.value || 'default';
    const thread = getOrCreateActiveThread(sid);

    // Auto-update judul thread jika masih default 'Percakapan Baru'
    if (thread.title === 'Percakapan Baru' || thread.messages.length === 0) {
      const cleanPrompt = promptText.trim().replace(/\n+/g, ' ');
      thread.title = cleanPrompt.length > 36 ? cleanPrompt.slice(0, 36) + '...' : cleanPrompt;
    }

    // Push User message
    thread.messages.push({
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: promptText.trim(),
      createdAt: Date.now(),
    });
    thread.updatedAt = Date.now();
    saveState();

    await continueAgentLoop(selectedSessionId.value);
  }

  async function continueAgentLoop(sessionId: string) {
    const provider = activeProvider.value;
    if (!provider) return;
    const sid = sessionId || selectedSessionId.value || 'default';
    const thread = getOrCreateActiveThread(sid);
    const chatList = thread.messages;

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
    thread.updatedAt = Date.now();
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
            thread.updatedAt = Date.now();
            saveState();
          },
          onError: (err: any) => {
            assistantMsg.content += `\n\n⚠️ Error: ${err.message || String(err)}`;
            thread.updatedAt = Date.now();
            saveState();
          },
          onFinish: async () => {
            thread.updatedAt = Date.now();
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
      thread.updatedAt = Date.now();
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
    threads,
    activeThreadId,
    activeThread,
    currentSessionThreads,
    messages,
    isThinking,
    toggleDrawer,
    openDrawer,
    closeDrawer,
    saveProvider,
    deleteProvider,
    setActiveProvider,
    setExecutionMode,
    createNewThread,
    switchThread,
    deleteThread,
    clearThreadMessages,
    getSessionMessages,
    clearMessages,
    sendMessage,
    continueAgentLoop,
    sendPromptWithContext,
    ensureSessionConnected,
    approveToolCall,
    rejectToolCall,
    retryToolCall,
    stopThinking,
  };
});
