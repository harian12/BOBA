import { defineStore } from 'pinia';
import { ref, computed, reactive } from 'vue';
import type { AiProviderConfig, AiChatMessage, AiToolCall, AiChatThread, AiCopilotMode } from '../types/index.js';
import { streamChat, truncateOutput, maskSensitiveData } from '../services/aiAdapters.js';
import { tauriBridge } from '../services/tauriBridge.js';
import { inspectCommandRisk } from '../services/commandExplainer.js';
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
  const copilotMode = ref<AiCopilotMode>('build');

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

      const savedCopilotMode = localStorage.getItem('boba_ai_copilot_mode');
      if (savedCopilotMode === 'plan' || savedCopilotMode === 'build') {
        copilotMode.value = savedCopilotMode;
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
      localStorage.setItem('boba_ai_copilot_mode', copilotMode.value);

      // Simpan maksimal 60 thread riwayat
      const trimmedThreads = threads.value.slice(0, 60).map(t => ({
        ...t,
        messages: t.messages,
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

  function setCopilotMode(mode: AiCopilotMode) {
    copilotMode.value = mode;
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
    return inspectCommandRisk(cmd) === 'danger';
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

      // Guard: Cek batasan Mode Plan
      if (copilotMode.value === 'plan') {
        if (toolCall.name === 'write_file') {
          throw new Error('Aksi ditolak: Mode saat ini adalah PLAN (Read-Only). Ubah ke Mode BUILD untuk menulis/memodifikasi file.');
        }
        if (toolCall.name === 'exec_command') {
          const cmd = (toolCall.args?.command || toolCall.args?.cmd || toolCall.args?.bash || '').trim();
          if (isDangerousCommand(cmd)) {
            throw new Error('Aksi ditolak: Perintah berbahaya dicegah dalam Mode PLAN. Ubah ke Mode BUILD jika ingin mengeksekusinya.');
          }
        }
      }

      if (toolCall.name === 'exec_command') {
        const cmd = (toolCall.args?.command || toolCall.args?.cmd || toolCall.args?.bash || '').trim();
        if (!cmd) throw new Error('Perintah (command) kosong');
        toolCall.args.command = cmd;
        const output = await tauriBridge.sshExecCommand(realSessionId, cmd);
        const finalResult = output && output.trim().length > 0 ? output : '(Perintah selesai dieksekusi tanpa output / kosong)';
        const sanitizedResult = maskSensitiveData(finalResult);
        toolCall.result = sanitizedResult;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return sanitizedResult;
      } else if (toolCall.name === 'read_file') {
        const path = toolCall.args.path;
        if (!path) throw new Error('Path file kosong');
        const content = await tauriBridge.sftpReadText(realSessionId, path);
        const sanitizedContent = maskSensitiveData(content);
        toolCall.result = sanitizedContent;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return sanitizedContent;
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
      } else if (toolCall.name === 'list_dir') {
        const dirPath = (toolCall.args?.path || '/').trim();
        try {
          const files = await tauriBridge.sftpList(realSessionId, dirPath);
          const formatted = Array.isArray(files)
            ? files.map((f: any) => `${f.is_dir ? '📁 [DIR]' : '📄 [FILE]'} ${f.name} (${f.size} B) [${f.permissions || 'default'}]`).join('\n')
            : 'Direktori kosong atau tidak ditemukan';
          toolCall.result = formatted;
          toolCall.status = 'completed';
          toolCall.executedAt = Date.now();
          return formatted;
        } catch {
          // Fallback via shell command
          const output = await tauriBridge.sshExecCommand(realSessionId, `ls -la "${dirPath}"`);
          toolCall.result = output;
          toolCall.status = 'completed';
          toolCall.executedAt = Date.now();
          return output;
        }
      } else if (toolCall.name === 'inspect_service') {
        const svc = (toolCall.args?.service_name || '').trim();
        const lines = Number(toolCall.args?.lines) || 30;
        if (!svc) throw new Error('Nama service kosong');
        const cmd = `systemctl status ${svc} --no-pager -l && echo "--- RECENT LOGS ---" && journalctl -u ${svc} -n ${lines} --no-pager`;
        const output = await tauriBridge.sshExecCommand(realSessionId, cmd);
        const sanitized = maskSensitiveData(output);
        toolCall.result = sanitized;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return sanitized;
      } else if (toolCall.name === 'run_security_audit') {
        const scope = (toolCall.args?.scope || 'full').toLowerCase();
        let cmd = '';
        if (scope === 'ssh') {
          cmd = `echo "=== SSH CONFIG AUDIT ===" && (grep -E "^(PermitRootLogin|PasswordAuthentication|Port|PubkeyAuthentication|X11Forwarding)" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null || echo "No custom sshd_config lines")`;
        } else if (scope === 'network') {
          cmd = `echo "=== LISTENING PORTS ===" && (ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null) && echo "=== FIREWALL STATUS ===" && (ufw status verbose 2>/dev/null || iptables -L -n -v 2>/dev/null || echo "No UFW/iptables info")`;
        } else if (scope === 'auth') {
          cmd = `echo "=== FAILED LOGIN AUDIT ===" && (grep "Failed password" /var/log/auth.log 2>/dev/null | tail -n 20 || journalctl -u ssh -u sshd -n 20 --no-pager 2>/dev/null || echo "No auth logs accessible")`;
        } else if (scope === 'permissions') {
          cmd = `echo "=== SUID BINARIES (TOP 15) ===" && find / -perm -4000 -type f 2>/dev/null | head -n 15 && echo "=== SUDOERS WITH NOPASSWD ===" && grep -rn "NOPASSWD" /etc/sudoers /etc/sudoers.d/ 2>/dev/null || echo "None"`;
        } else {
          // Full scope composite read-only script
          cmd = `echo "=== 1. SSH CONFIG ===" && (grep -E "^(PermitRootLogin|PasswordAuthentication|Port|PubkeyAuthentication)" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null || echo "Default") && echo "=== 2. OPEN PORTS ===" && (ss -tulpn 2>/dev/null | grep LISTEN || netstat -tulpn 2>/dev/null | grep LISTEN) && echo "=== 3. FIREWALL ===" && (ufw status 2>/dev/null || echo "UFW not active") && echo "=== 4. CRON JOBS ===" && (ls -la /etc/cron* /var/spool/cron/crontabs 2>/dev/null | head -n 15) && echo "=== 5. USERS WITH SHELL ===" && (grep -v "/nologin\\|/false" /etc/passwd | cut -d: -f1,3,7)`;
        }
        const output = await tauriBridge.sshExecCommand(realSessionId, cmd);
        const sanitized = maskSensitiveData(output);
        toolCall.result = sanitized;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return sanitized;
      } else if (toolCall.name === 'check_auth_failures') {
        const limit = Number(toolCall.args?.limit) || 10;
        const cmd = `(grep "Failed password" /var/log/auth.log 2>/dev/null || journalctl -u ssh -u sshd --no-pager 2>/dev/null | grep "Failed password") | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' | sort | uniq -c | sort -nr | head -n ${limit}`;
        const output = await tauriBridge.sshExecCommand(realSessionId, cmd);
        const formatted = output && output.trim().length > 0
          ? `Top Brute-force Attacker IPs (Attempts Count | IP):\n${output}`
          : 'Tidak ditemukan aktivitas failed login password yang mencurigakan di log.';
        toolCall.result = formatted;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return formatted;
      } else if (toolCall.name === 'setup_security_hardening') {
        const port = Number(toolCall.args?.ssh_port) || 22;
        const enableUfw = toolCall.args?.enable_ufw !== false;
        const installFail2ban = !!toolCall.args?.install_fail2ban;

        // Anti-lockout sequence: selalu allow SSH port sebelum enable firewall
        let script = `echo "=== 1. SSH SAFEGUARD ===" && ufw allow ${port}/tcp && echo "SSH Port ${port} allowed in firewall."`;
        if (enableUfw) {
          script += ` && echo "y" | ufw enable && echo "UFW firewall enabled."`;
        }
        if (installFail2ban) {
          script += ` && (which fail2ban-client >/dev/null 2>&1 || (apt-get update -y && apt-get install -y fail2ban) || yum install -y fail2ban || true) && systemctl enable --now fail2ban && echo "Fail2ban enabled."`;
        }
        const output = await tauriBridge.sshExecCommand(realSessionId, script);
        const sanitized = maskSensitiveData(output);
        toolCall.result = sanitized;
        toolCall.status = 'completed';
        toolCall.executedAt = Date.now();
        return sanitized;
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
          const toolContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          // Masukkan tool result ke riwayat pesan dan picu AI untuk analisis lanjutan
          list.push({
            id: `msg_tool_${Date.now()}`,
            role: 'tool',
            toolCallId: tc.id,
            content: toolContent,
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
          const toolContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

          const existingToolMsg = list.find(m => m.role === 'tool' && m.toolCallId === tc.id);
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

    const modeDirective = copilotMode.value === 'plan'
      ? `### OPERATIONAL MODE: 📋 PLAN (READ-ONLY & DIAGNOSTIK)
Saat ini kamu berada dalam Mode PLAN.
- FOKUS: Hanya mendiagnosa, membaca log/konfigurasi, memeriksa status server, dan MENYUSUN RENCANA AKSI YANG JELAS.
- DILARANG: Memodifikasi file (write_file dinonaktifkan), menginstal software, merestart service penting, atau mengeksekusi aksi yang mengubah state server.
- Setelah selesai mengumpulkan data dan menganalisis, sajikan ringkasan temuan dan susun langkah-langkah perbaikan, lalu minta pengguna untuk beralih ke Mode BUILD untuk mengeksekusi rencananya.`
      : `### OPERATIONAL MODE: 🔨 BUILD (EKSEKUSI & PERBAIKAN AKTIF)
Saat ini kamu berada dalam Mode BUILD.
- Kamu memiliki izin untuk mengeksekusi perintah bash, memperbarui konfigurasi (write_file), dan mengonfigurasi layanan server remote.`;

    return `You are BOBA AI Server Copilot, an elite Autonomous Senior DevOps & Linux System Administrator running the LFG (Autonomous Shipping & Ops) Engine.
Current Target Server: ${hostInfo}

${modeDirective}

### ATURAN MUTLAK EKSEKUSI PERINTAH (STRICTLY SEQUENTIAL):
- Kamu HANYA BOLEH memanggil MAKSIMAL 1 tool dalam satu respon/giliran. DILARANG KERAS memanggil lebih dari satu tool sekaligus secara paralel.
- Kamu WAJIB menunggu hasil output eksekusi dari tool sebelumnya sebelum menentukan dan memanggil langkah/perintah berikutnya.
- Saat memanggil 'exec_command', kamu WAJIB menyertakan:
  * 'description': Penjelasan ringkas dalam Bahasa Indonesia yang ramah bagi pengguna awam mengenai apa yang dilakukan perintah ini.
  * 'impact': Penjelasan dampak langsung atau efek samping terhadap server (apakah aman/read-only, restart service, memodifikasi konfigurasi, atau berpotensi downtime).

### DISIPLIN MERESPON HASIL EKSEKUSI TOOL (SANGAT PENTING):
- Jika perintah menghasilkan ERROR, Access Denied, Permission Denied, atau sintaks salah: JANGAN PERNAH BERHENTI atau menganggap tugas selesai!
- Analisis error tersebut dan ambil langkah pemulihan (Self-Healing):
  * Jika MySQL Access Denied: Cari password database (misal baca wp-config.php atau .env), atau gunakan sudo / autentikasi yang tepat.
  * Jika service gagal/crash: Periksa log detail atau perbaiki konfigurasi.
- Selalu berikan penjelasan teks analisis yang informatif sebelum memanggil perintah berikutnya. DILARANG menghasilkan pesan kosong!

You have access to tools to inspect and configure the server:
- exec_command: execute bash commands to inspect status, logs, packages, services, network, or perform configuration.
- read_file: read full text of configuration files or logs.
- write_file: update or create configuration files (a backup will be made automatically, only in BUILD mode).
- get_system_metrics: check current CPU, RAM, Disk, and load average.

### LFG DevOps Engine (Autonomous Execution Pipeline)
1. STAGE 1 - PLAN FIRST: Rumuskan rencana singkat sebelum memodifikasi konfigurasi atau men-deploy container/service.
2. STAGE 2 - AUTONOMOUS EXECUTION: Jalankan langkah demi langkah secara berurutan. Jangan memaksakan workaround berat jika terhalang izin atau autentikasi.
3. STAGE 3 - VERIFICATION EVIDENCE CONTRACT: Periksa keaktifan service/konfigurasi secara nyata (docker ps, systemctl is-active, ss/curl, nginx -t).
4. STAGE 4 - SELF-HEALING LOOP: Perbaiki jika ditemukan kegagalan verifikasi.
5. STAGE 5 - COMPLETION PROOF & SUMMARY: Berikan laporan penutup terstruktur dalam Bahasa Indonesia dengan istilah teknis dalam bahasa Inggris. DILARANG meninggalkan pesan kosong.

### KEAMANAN KREDENSIAL & REMOTE GIT:
- Token kredensial pada URL remote Git (seperti output 'git remote -v' atau file '.git/config') otomatis disamarkan (masked) sebagai 'https://***@github.com' agar tidak bocor ke provider AI.
- DILARANG meminta pengguna memasukkan token atau kredensial Git dalam percakapan. Jika dibutuhkan remote autentikasi, sarankan penggunaan SSH Key atau Git Credential Manager.`;
  }

  async function sendMessage(promptText: string) {
    if (isThinking.value) {
      dialogStore.showToast('AI sedang memproses respon, mohon tunggu hingga selesai atau klik Stop.', 'warning', 3000);
      return;
    }

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

    // Push User message (mask sensitive tokens if user pasted git remote urls with tokens)
    thread.messages.push({
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: maskSensitiveData(promptText.trim()),
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

    // Guard: Pastikan tidak ada tool call yang masih menunggu izin pada giliran terbaru
    const lastAssistantWithTools = [...chatList].reverse().find(m => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0);
    if (lastAssistantWithTools && lastAssistantWithTools.toolCalls) {
      const pendingTc = lastAssistantWithTools.toolCalls.find(tc => tc.status === 'pending_approval');
      if (pendingTc) {
        dialogStore.showToast('Setujui atau tolak perintah terminal yang sedang menunggu izin terlebih dahulu.', 'warning', 3000);
        return;
      }
    }

    isThinking.value = true;
    activeAbortController = new AbortController();

    // Create assistant placeholder message - pastikan createdAt selalu lebih baru dari pesan sebelumnya
    const lastMsgTime = chatList.length > 0 ? (chatList[chatList.length - 1]?.createdAt || 0) : 0;
    const assistantMsg = reactive<AiChatMessage>({
      id: `msg_ai_${Date.now()}`,
      role: 'assistant',
      content: '',
      toolCalls: [],
      createdAt: Math.max(Date.now(), lastMsgTime + 1),
    });
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
            thread.updatedAt = Date.now();
          },
          onToolCalls: (tcs: AiToolCall[]) => {
            // Ambil hanya 1 perintah pertama untuk sequential discipline
            assistantMsg.toolCalls = tcs.slice(0, 1);
            thread.updatedAt = Date.now();
            saveState();
          },
          onError: (err: any) => {
            assistantMsg.content += `\n\n⚠️ Error: ${err.message || String(err)}`;
            thread.updatedAt = Date.now();
            saveState();
          },
          onFinish: async () => {
            isThinking.value = false;
            activeAbortController = null;

            // Cek apakah ada tool calls lanjutan yang dihasilkan
            if (assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0) {
              if (executionMode.value === 'auto') {
                // Eksekusi otomatis jika BUKAN perintah berbahaya
                const pendingCall = assistantMsg.toolCalls.find(tc => tc.status === 'pending_approval');
                if (pendingCall) {
                  const cmd = (pendingCall.args?.command || pendingCall.args?.cmd || pendingCall.args?.bash || '').trim();
                  if (pendingCall.name === 'exec_command' && isDangerousCommand(cmd)) {
                    dialogStore.showToast('Perintah berisiko tinggi memerlukan persetujuan manual', 'warning', 3000);
                  } else if (copilotMode.value === 'plan' && pendingCall.name === 'write_file') {
                    dialogStore.showToast('Penulisan file dicegah dalam Mode Plan (Read-Only)', 'warning', 3000);
                  } else {
                    let executed = false;
                    try {
                      const result = await executeTool(selectedSessionId.value, pendingCall);
                      const toolContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                      chatList.push({
                        id: `msg_tool_${Date.now()}`,
                        role: 'tool',
                        toolCallId: pendingCall.id,
                        content: toolContent,
                        createdAt: Date.now(),
                      });
                      executed = true;
                    } catch (e: any) {
                      chatList.push({
                        id: `msg_tool_err_${Date.now()}`,
                        role: 'tool',
                        toolCallId: pendingCall.id,
                        content: `Error executing ${pendingCall.name}: ${e.message || String(e)}`,
                        createdAt: Date.now(),
                      });
                      executed = true;
                    }
                    if (executed) {
                      thread.updatedAt = Date.now();
                      saveState();
                      await continueAgentLoop(selectedSessionId.value);
                    }
                  }
                }
              }
            } else {
              // Jika TIDAK ADA tool calls lanjutan yang dipanggil AI pada giliran ini
              const prevMsg = chatList[chatList.length - 2];
              if (prevMsg && prevMsg.role === 'tool') {
                if (!assistantMsg.content || assistantMsg.content.trim().length === 0) {
                  const contentStr = typeof prevMsg.content === 'string' ? prevMsg.content : JSON.stringify(prevMsg.content || '');
                  const hasError = /\b(error|failed|fatal|denied|cannot|not found|refused|rejected)\b/i.test(contentStr);

                  if (hasError) {
                    assistantMsg.content = `⚠️ Perintah terminal sebelumnya menghasilkan kendala atau error:\n\`\`\`\n${contentStr.slice(0, 400)}\n\`\`\`\nAI belum melanjutkan eksekusi. Silakan klik tombol **✨ Lanjutkan Analisis Masalah** di bawah atau berikan instruksi tambahan.`;
                  } else {
                    assistantMsg.content = '✅ Perintah di server telah selesai dieksekusi.';
                  }
                }
                dialogStore.showToast('Respon AI Copilot selesai', 'info', 2000);
              }
            }

            thread.updatedAt = Date.now();
            saveState();
          },
        },
        activeAbortController.signal,
        copilotMode.value
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
    copilotMode,
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
    setCopilotMode,
    saveState,
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
