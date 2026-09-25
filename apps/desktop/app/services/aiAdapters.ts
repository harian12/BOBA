import type { AiProviderConfig, AiChatMessage, AiToolCall, AiCopilotMode } from '../types/index.js';
import { tauriBridge } from './tauriBridge.js';

export const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'exec_command',
      description: 'Run a shell command on the remote Linux server via SSH. Returns stdout and stderr.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The exact bash command to execute (e.g. "systemctl status nginx", "cat /etc/hosts", "df -h")',
          },
          description: {
            type: 'string',
            description: 'Penjelasan ringkas dalam Bahasa Indonesia yang mudah dipahami pengguna awam tentang tujuan perintah ini.',
          },
          impact: {
            type: 'string',
            description: 'Penjelasan dampak atau konsekuensi perintah terhadap server (misal: aman/read-only, restart layanan, perubahan file, atau potensi downtime).',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the text content of a file on the remote server via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the file on the remote server (e.g. "/etc/nginx/nginx.conf")',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write or update a text file on the remote server. A backup of the existing file will be created automatically before saving.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the file to create or overwrite',
          },
          content: {
            type: 'string',
            description: 'The full text content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_system_metrics',
      description: 'Get real-time CPU, RAM, Disk usage, uptime, and system load average of the remote server.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_dir',
      description: 'List contents of a directory on the remote server with metadata (files, folders, sizes, permissions).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to list on the remote server (e.g. "/var/log", "/etc/nginx", "/home")',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'inspect_service',
      description: 'Inspect systemd service status and recent journalctl log lines on the remote server.',
      parameters: {
        type: 'object',
        properties: {
          service_name: {
            type: 'string',
            description: 'Name of the service (e.g. "nginx", "docker", "mariadb", "pm2")',
          },
          lines: {
            type: 'number',
            description: 'Number of recent log lines to retrieve (default 30)',
          },
        },
        required: ['service_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_security_audit',
      description: 'Run an automated, read-only Linux security audit (SSH hardening, firewall/open ports, failed logins, SUID binaries, cron persistence, sudo permissions).',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['full', 'ssh', 'network', 'auth', 'permissions'],
            description: 'Audit scope: "full" for complete audit, "ssh" for SSH config, "network" for ports & firewall, "auth" for failed logins, "permissions" for SUID & sudoers.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_auth_failures',
      description: 'Analyze authentication logs (/var/log/auth.log or journalctl) to identify top attacker IPs performing brute-force SSH attempts.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of attacker IPs to report (default 10)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'setup_security_hardening',
      description: 'Safely apply baseline Linux security hardening with SSH lockout protection (UFW firewall, SSH key enforcement, fail2ban setup).',
      parameters: {
        type: 'object',
        properties: {
          enable_ufw: {
            type: 'boolean',
            description: 'Enable UFW firewall and allow current SSH port first (default true)',
          },
          ssh_port: {
            type: 'number',
            description: 'The SSH port to keep open to prevent lockout (default 22)',
          },
          install_fail2ban: {
            type: 'boolean',
            description: 'Install and enable fail2ban service for SSH intrusion prevention',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'db_list_databases',
      description: 'Daftar semua koneksi database yang tersimpan di vault (MySQL, PostgreSQL, SQLite, Redis, Mongo) beserta database/skema yang aktif.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'db_get_schema',
      description: 'Ambil skema lengkap (daftar tabel, kolom, tipe data, dan primary key) dari koneksi database tertentu atau yang sedang aktif.',
      parameters: {
        type: 'object',
        properties: {
          connection_id: {
            type: 'string',
            description: 'ID koneksi database (opsional, jika kosong menggunakan database yang sedang aktif).',
          },
          database: {
            type: 'string',
            description: 'Nama database / schema spesifik (opsional).',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'db_execute_query',
      description: 'Jalankan query SQL ke database target. Perintah BACA (SELECT/SHOW/EXPLAIN) dan perintah UBAH/HAPUS (UPDATE/DELETE/DROP/INSERT/ALTER) didukung. Secara default, isi data baris tidak dikirim ke AI demi privasi. Jika AI benar-benar memerlukan baris data untuk dianalisis, set include_data_for_ai: true (pengguna akan dimintai konfirmasi persetujuan terlebih dahulu).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Query SQL yang akan dieksekusi (contoh: "SELECT * FROM users WHERE status = \'active\' LIMIT 10", "UPDATE users SET status = \'banned\' WHERE id = 5")',
          },
          include_data_for_ai: {
            type: 'boolean',
            description: 'Set true jika kamu memerlukan isi baris data (records) nyata untuk dianalisis/dijelaskan ke pengguna. Pengguna AKAN dimintai konfirmasi izin manual sebelum baris data dikirim ke model AI.',
          },
          connection_id: {
            type: 'string',
            description: 'ID koneksi database (opsional, jika kosong menggunakan database yang sedang aktif)',
          },
          database: {
            type: 'string',
            description: 'Nama database / schema (opsional)',
          },
          description: {
            type: 'string',
            description: 'Penjelasan ringkas dalam Bahasa Indonesia tentang tujuan dan apa yang dilakukan query ini.',
          },
          impact: {
            type: 'string',
            description: 'Penjelasan dampak query: "Aman (Read-Only)", "Izin Data: Mengirim N baris data ke AI", atau "Peringatan: Mengubah / Menghapus data pada tabel X".',
          },
        },
        required: ['query', 'description'],
      },
    },
  },
];

export function getAgentTools(mode: AiCopilotMode = 'build') {
  if (mode === 'plan') {
    // Mode plan hanya read-only/diagnostik: sembunyikan write_file
    return AGENT_TOOLS.filter(t => t.function.name !== 'write_file');
  }
  return AGENT_TOOLS;
}

export function truncateOutput(text: string, _maxLen?: number): string {
  // Limit dilepas penuh sesuai permintaan pengguna
  return text || '';
}

/**
 * Mask sensitive tokens and credentials from command output, file content, or chat text
 * so that private credentials (e.g. git remote tokens, PATs, bearer tokens) are never sent
 * to external AI providers (OpenAI, Anthropic, Gemini, Ollama, etc.).
 */
export function maskSensitiveData(text: string): string {
  if (!text || typeof text !== 'string') return text;

  return text
    // 1. Mask user:token or token in HTTP/HTTPS URLs (git remote -v, git clone, etc.)
    .replace(/(https?:\/\/)[^\s\/]+@/gi, (_, proto) => `${proto}***@`)
    // 2. Mask database connection URI passwords (mysql://user:pass@host, postgres://user:pass@host, redis://:pass@host)
    .replace(/(mysql|postgresql|postgres|mongodb|redis|sqlite):\/\/([^:]+):([^@]+)@/gi, (_, proto, user) => `${proto}://${user}:***@`)
    // 3. Mask GitHub Personal Access Tokens (classic, fine-grained, OAuth)
    .replace(/\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{30,255}\b/g, (_, prefix) => `${prefix}_***`)
    .replace(/\bgithub_pat_[a-zA-Z0-9_]{50,255}\b/g, 'github_pat_***')
    // 4. Mask GitLab Personal Access Tokens
    .replace(/\bglpat-[a-zA-Z0-9\-_]{20,255}\b/g, 'glpat-***')
    // 5. Mask Authorization headers with Bearer tokens
    .replace(/(Authorization:\s*Bearer\s+)[a-zA-Z0-9\-_.]{16,}/gi, (_, prefix) => `${prefix}***`);
}

export async function fetchAvailableModels(provider: Partial<AiProviderConfig>): Promise<string[]> {
  const type = provider.type || 'openai';
  const rawBaseUrl = (provider.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = (provider.apiKey || '').trim();

  try {
    // 1. OLLAMA
    if (type === 'ollama') {
      const url = rawBaseUrl || 'http://localhost:11434';
      const endpoint = `${url}/api/tags`;
      try {
        const nativeModels = await tauriBridge.fetchAiModels(endpoint, apiKey);
        if (Array.isArray(nativeModels) && nativeModels.length > 0) {
          return nativeModels;
        }
      } catch {
        // Fallback to browser fetch
      }
      const res = await fetch(endpoint, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (Array.isArray(data.models)) {
        return data.models.map((m: any) => m.name || m.model).filter(Boolean);
      }
      return [];
    }

    // 2. GOOGLE GEMINI
    if (type === 'gemini') {
      const baseUrl = rawBaseUrl || 'https://generativelanguage.googleapis.com';
      const res = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (Array.isArray(data.models)) {
        return data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace(/^models\//, ''));
      }
      return [];
    }

    // 3. ANTHROPIC CLAUDE
    if (type === 'anthropic') {
      const defaultClaudeModels = [
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ];
      try {
        const baseUrl = rawBaseUrl || 'https://api.anthropic.com';
        const res = await fetch(`${baseUrl}/v1/models`, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            return data.data.map((m: any) => m.id);
          }
        }
      } catch (_) {}
      return defaultClaudeModels;
    }

    // 4. OPENAI / CUSTOM OPENAI-COMPATIBLE / DEEPSEEK / OPENROUTER / GROQ
    const baseUrl = rawBaseUrl || 'https://api.openai.com/v1';
    // Handle both "/v1" and plain root base urls
    const endpoint = baseUrl.endsWith('/models') ? baseUrl : `${baseUrl}/models`;

    // Try native Tauri backend first (bypasses browser CORS/preflight limitations completely)
    try {
      const nativeModels = await tauriBridge.fetchAiModels(endpoint, apiKey);
      if (Array.isArray(nativeModels) && nativeModels.length > 0) {
        return nativeModels;
      }
    } catch {
      // Fallback to browser fetch
    }

    // Append ?key= parameter to allow preflight OPTIONS to pass on gateways that require API key for CORS preflight
    let fetchUrl = endpoint;
    if (apiKey && !fetchUrl.includes('key=')) {
      const sep = fetchUrl.includes('?') ? '&' : '?';
      fetchUrl = `${fetchUrl}${sep}key=${encodeURIComponent(apiKey)}`;
    }

    const res = await fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (Array.isArray(data.data)) {
      return data.data.map((m: any) => m.id).sort();
    }
    return [];
  } catch (err: any) {
    console.error('Failed to fetch models:', err);
    throw err;
  }
}

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onToolCalls: (toolCalls: AiToolCall[]) => void;
  onError: (err: any) => void;
  onFinish: () => void;
}

export async function streamChat(
  provider: AiProviderConfig,
  messages: AiChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  copilotMode: AiCopilotMode = 'build'
): Promise<void> {
  const type = provider.type;
  const baseUrl = provider.baseUrl.trim().replace(/\/+$/, '');

  if (type === 'anthropic') {
    await streamAnthropic(baseUrl, provider.apiKey, provider.model, messages, systemPrompt, callbacks, signal, copilotMode);
  } else if (type === 'gemini') {
    await streamGemini(baseUrl, provider.apiKey, provider.model, messages, systemPrompt, callbacks, signal, copilotMode);
  } else {
    // OpenAI, Ollama, DeepSeek, OpenRouter, Custom
    await streamOpenAiCompatible(baseUrl, provider.apiKey, provider.model, messages, systemPrompt, callbacks, signal, copilotMode);
  }
}

// -------------------------------------------------------------
// Native Desktop HTTP Stream Helper (Bypass CORS via Rust reqwest)
// -------------------------------------------------------------
async function streamViaNativeHttp(
  url: string,
  headers: Record<string, string>,
  body: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return new Promise<void>(async (resolve, reject) => {
    let unlisten: (() => void) | null = null;
    let finished = false;

    const cleanup = () => {
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      if (!finished) {
        finished = true;
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      }
    };

    if (signal) {
      if (signal.aborted) {
        return reject(new DOMException('Aborted', 'AbortError'));
      }
      signal.addEventListener('abort', onAbort);
    }

    try {
      unlisten = await tauriBridge.onAiStreamEvent((event) => {
        if (event.stream_id !== streamId) return;

        if (event.error) {
          if (!finished) {
            finished = true;
            cleanup();
            reject(new Error(event.error));
          }
          return;
        }

        if (event.chunk) {
          onChunk(event.chunk);
        }

        if (event.done) {
          if (!finished) {
            finished = true;
            cleanup();
            resolve();
          }
        }
      });

      await tauriBridge.aiHttpStream(streamId, url, headers, body);
    } catch (err: any) {
      if (!finished) {
        finished = true;
        cleanup();
        reject(err);
      }
    }
  });
}

// -------------------------------------------------------------
// Message Sanitizer for LLMs (OpenAI, Gemini, Anthropic)
// Mencegah error 'function call turn comes immediately after a user turn...'
// -------------------------------------------------------------
export function sanitizeMessagesForOpenAi(
  messages: AiChatMessage[],
  systemPrompt: string
): any[] {
  // Seluruh riwayat pesan dikirim penuh (tanpa limit pemotongan pesan)
  const windowedMessages = [...messages];

  const toolNameMap = new Map<string, string>();
  for (const m of windowedMessages) {
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        if (tc.id) toolNameMap.set(tc.id, tc.name);
      }
    }
  }

  const rawFormatted: any[] = [];

  for (const m of windowedMessages) {
    if (m.role === 'tool') {
      const toolName = (m.toolCallId && toolNameMap.get(m.toolCallId)) || 'exec_command';
      const cleanContent = m.content && m.content.trim().length > 0
        ? m.content
        : '(Perintah selesai dieksekusi tanpa output)';

      rawFormatted.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        name: toolName,
        content: maskSensitiveData(cleanContent),
      });
    } else if (m.role === 'assistant') {
      const cleanText = (m.content || '')
        .replace(/\n*⚠️ (Connection Error|Error):[\s\S]*$/, '')
        .trim();

      // KUNCI: Batasi tool call maksimal 1 per giliran agar strictly sequential
      const validToolCalls = (m.toolCalls || []).filter(tc => tc.id && tc.name).slice(0, 1);

      if (validToolCalls.length > 0) {
        rawFormatted.push({
          role: 'assistant',
          content: cleanText ? maskSensitiveData(cleanText) : null,
          tool_calls: validToolCalls.map(tc => {
            const rawArgs = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {});
            return {
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: maskSensitiveData(rawArgs),
              },
            };
          }),
        });
      } else if (cleanText.length > 0) {
        rawFormatted.push({
          role: 'assistant',
          content: maskSensitiveData(cleanText),
        });
      }
    } else if (m.role === 'user') {
      const text = (m.content || '').trim();
      if (text.length > 0) {
        rawFormatted.push({
          role: 'user',
          content: maskSensitiveData(text),
        });
      }
    }
  }

  const normalized: any[] = [{ role: 'system', content: systemPrompt }];

  for (let i = 0; i < rawFormatted.length; i++) {
    const item = rawFormatted[i];
    const prev = normalized[normalized.length - 1];

    if (item.role === 'tool') {
      // Pastikan role 'tool' HANYA dikirim jika pesan sebelumnya adalah 'assistant' yang memiliki tool_call_id tersebut
      const prevHasThisToolCall =
        prev &&
        prev.role === 'assistant' &&
        Array.isArray(prev.tool_calls) &&
        prev.tool_calls.some((tc: any) => tc.id === item.tool_call_id);

      if (prevHasThisToolCall) {
        normalized.push(item);
      } else {
        // Jika tidak berurutan langsung di bawah assistant pemanggilnya (orphaned), ubah ke role 'user'
        // Ini mutlak mencegah error DeepSeek 400: "Messages with role 'tool' must be a response to a preceding message with 'tool_calls'"
        normalized.push({
          role: 'user',
          content: `[Hasil Eksekusi ${item.name}]:\n${item.content}`,
        });
      }
    } else if (item.role === 'assistant') {
      if (prev && prev.role === 'assistant') {
        if (item.tool_calls && !prev.tool_calls) {
          if (prev.content && !item.content) item.content = prev.content;
          normalized[normalized.length - 1] = item;
        } else if (!item.tool_calls && prev.tool_calls) {
          // Pertahankan prev dengan tool_calls
        } else {
          prev.content = `${prev.content || ''}\n${item.content || ''}`.trim();
        }
      } else {
        // Jika asisten memiliki tool_calls yang tidak pernah dijawab di pesan berikutnya (misal in-flight/cancelled)
        if (item.tool_calls && item.tool_calls.length > 0) {
          const nextItem = rawFormatted[i + 1];
          const hasImmediateAnswer =
            nextItem &&
            nextItem.role === 'tool' &&
            item.tool_calls.some((tc: any) => tc.id === nextItem.tool_call_id);

          if (!hasImmediateAnswer && i === rawFormatted.length - 1) {
            // Hapus tool_calls pada pesan asisten paling akhir agar LLM tidak menolak payload
            item.tool_calls = undefined;
            if (!item.content) item.content = 'Sedang menganalisis status server...';
          }
        }
        normalized.push(item);
      }
    } else if (item.role === 'user') {
      if (prev && prev.role === 'user') {
        prev.content = `${prev.content}\n${item.content}`;
      } else {
        normalized.push(item);
      }
    }
  }

  while (normalized.length > 1 && normalized[normalized.length - 1].role === 'assistant') {
    normalized.pop();
  }

  return normalized;
}

// -------------------------------------------------------------
// Adapter: OpenAI-Compatible (/chat/completions)
// -------------------------------------------------------------
async function streamOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: AiChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  copilotMode: AiCopilotMode = 'build'
) {
  let endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  // Hanya tambahkan query key jika endpoint menuju Google Generative Language API
  if (apiKey && !endpoint.includes('key=') && baseUrl.includes('googleapis.com')) {
    const sep = endpoint.includes('?') ? '&' : '?';
    endpoint = `${endpoint}${sep}key=${encodeURIComponent(apiKey)}`;
  }

  const formattedMessages = sanitizeMessagesForOpenAi(messages, systemPrompt);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const reqBody = JSON.stringify({
    model,
    messages: formattedMessages,
    tools: getAgentTools(copilotMode),
    tool_choice: 'auto',
    parallel_tool_calls: false, // Mutlak false agar AI hanya mengajukan 1 perintah per giliran
    stream: true,
  });

  let buffer = '';
  const accumulatedToolCalls: Record<number, { id: string; name: string; argsStr: string }> = {};

  const handleChunk = (chunkText: string) => {
    buffer += chunkText;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed === 'data: [DONE]') continue;

      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.substring(6));
          const choice = json.choices?.[0];
          if (!choice) continue;

          // Content delta (termasuk text delta & reasoning_content untuk DeepSeek R1 / Qwen)
          const token = choice.delta?.content ?? choice.delta?.text ?? choice.text;
          if (token) {
            callbacks.onToken(token);
          } else if (choice.delta?.reasoning_content) {
            callbacks.onToken(choice.delta.reasoning_content);
          }

          // Tool calls delta
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!accumulatedToolCalls[idx]) {
                accumulatedToolCalls[idx] = {
                  id: tc.id || `tc_${Date.now()}_${idx}`,
                  name: '',
                  argsStr: '',
                };
              }
              if (tc.id) accumulatedToolCalls[idx].id = tc.id;
              if (tc.function?.name) {
                const inc = tc.function.name;
                const cur = accumulatedToolCalls[idx].name;
                if (!cur) {
                  accumulatedToolCalls[idx].name = inc;
                } else if (inc.startsWith(cur)) {
                  accumulatedToolCalls[idx].name = inc;
                } else if (!cur.includes(inc)) {
                  accumulatedToolCalls[idx].name += inc;
                }
              }
              if (tc.function?.arguments) accumulatedToolCalls[idx].argsStr += tc.function.arguments;
            }
          }
        } catch (_) {}
      }
    }
  };

  try {
    await streamViaNativeHttp(endpoint, headers, reqBody, handleChunk, signal);

    if (buffer.trim()) {
      handleChunk('\n');
    }

    // Process collected tool calls
    const toolCallKeys = Object.keys(accumulatedToolCalls);
    if (toolCallKeys.length > 0) {
      const finalToolCalls: AiToolCall[] = [];
      for (const k of toolCallKeys) {
        const raw = accumulatedToolCalls[Number(k)];
        if (!raw) continue;
        let parsedArgs = {};
        try {
          parsedArgs = JSON.parse(raw.argsStr || '{}');
        } catch (_) {
          parsedArgs = { raw: raw.argsStr };
        }
        finalToolCalls.push({
          id: raw.id,
          name: raw.name,
          args: parsedArgs,
          status: 'pending_approval',
        });
      }
      // Wajib: Ambil hanya 1 perintah pertama per giliran
      if (finalToolCalls.length > 1) {
        finalToolCalls.length = 1;
      }
      callbacks.onToolCalls(finalToolCalls);
    }

    callbacks.onFinish();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      callbacks.onFinish();
      return;
    }
    callbacks.onError(err);
  }
}

// -------------------------------------------------------------
// Adapter: Anthropic Claude (/v1/messages)
// -------------------------------------------------------------
async function streamAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: AiChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  copilotMode: AiCopilotMode = 'build'
) {
  const endpoint = `${baseUrl || 'https://api.anthropic.com'}/v1/messages`;

  const toolsToUse = getAgentTools(copilotMode);
  const anthropicTools = toolsToUse.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  // Filter pesan kosong agar API tidak menolak dengan 400 Bad Request
  const validMessages = messages.filter(m => {
    if (m.role === 'tool') return true;
    if (m.role === 'assistant') {
      return (m.content && m.content.trim().length > 0) || (m.toolCalls && m.toolCalls.length > 0);
    }
    return m.content && m.content.trim().length > 0;
  });

  const formattedMessages: any[] = [];
  for (const m of validMessages) {
    if (m.role === 'tool') {
      formattedMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId,
            content: maskSensitiveData(m.content || ''),
          },
        ],
      });
    } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const contentList: any[] = [];
      if (m.content) contentList.push({ type: 'text', text: maskSensitiveData(m.content) });
      for (const tc of m.toolCalls.slice(0, 1)) {
        let cleanInput: any = tc.args;
        if (typeof cleanInput === 'string') {
          try {
            cleanInput = JSON.parse(maskSensitiveData(cleanInput));
          } catch (_) {
            cleanInput = { raw: maskSensitiveData(cleanInput) };
          }
        } else if (cleanInput && typeof cleanInput === 'object') {
          try {
            cleanInput = JSON.parse(maskSensitiveData(JSON.stringify(cleanInput)));
          } catch (_) {}
        }
        contentList.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: cleanInput,
        });
      }
      formattedMessages.push({ role: 'assistant', content: contentList });
    } else {
      formattedMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: maskSensitiveData(m.content || ''),
      });
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  const reqBody = JSON.stringify({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: formattedMessages,
    tools: anthropicTools,
    stream: true,
  });

  let buffer = '';
  const accumulatedTools: Record<number, { id: string; name: string; jsonStr: string }> = {};
  let currentToolIndex = -1;

  const handleChunk = (chunkText: string) => {
    buffer += chunkText;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.substring(6);
      if (dataStr === '[DONE]') continue;

      try {
        const event = JSON.parse(dataStr);

        if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          currentToolIndex = event.index;
          accumulatedTools[currentToolIndex] = {
            id: event.content_block.id,
            name: event.content_block.name,
            jsonStr: '',
          };
        } else if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta') {
            callbacks.onToken(event.delta.text);
          } else if (event.delta?.type === 'input_json_delta' && currentToolIndex >= 0) {
            const currentTool = accumulatedTools[currentToolIndex];
            if (currentTool) {
              currentTool.jsonStr += event.delta.partial_json;
            }
          }
        }
      } catch (_) {}
    }
  };

  try {
    await streamViaNativeHttp(endpoint, headers, reqBody, handleChunk, signal);

    if (buffer.trim()) {
      handleChunk('\n');
    }

    const toolKeys = Object.keys(accumulatedTools);
    if (toolKeys.length > 0) {
      const finalToolCalls: AiToolCall[] = [];
      for (const k of toolKeys) {
        const raw = accumulatedTools[Number(k)];
        if (!raw) continue;
        let parsed = {};
        try {
          parsed = JSON.parse(raw.jsonStr || '{}');
        } catch (_) {}
        finalToolCalls.push({
          id: raw.id,
          name: raw.name,
          args: parsed,
          status: 'pending_approval',
        });
      }
      if (finalToolCalls.length > 1) {
        finalToolCalls.length = 1;
      }
      callbacks.onToolCalls(finalToolCalls);
    }

    callbacks.onFinish();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      callbacks.onFinish();
      return;
    }
    callbacks.onError(err);
  }
}

// -------------------------------------------------------------
// Adapter: Google Gemini (/v1beta/models/...:streamGenerateContent)
// -------------------------------------------------------------
async function streamGemini(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: AiChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  copilotMode: AiCopilotMode = 'build'
) {
  const root = baseUrl || 'https://generativelanguage.googleapis.com';
  const cleanModel = model.replace(/^models\//, '');
  const endpoint = `${root}/v1beta/models/${cleanModel}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const toolsToUse = getAgentTools(copilotMode);
  const geminiTools = [
    {
      function_declarations: toolsToUse.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];

  const sanitized = sanitizeMessagesForOpenAi(messages, '');
  const rawContents: any[] = [];
  for (const m of sanitized) {
    if (m.role === 'system') continue;

    if (m.role === 'tool') {
      rawContents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.name || 'exec_command',
              response: {
                name: m.name || 'exec_command',
                content: m.content,
              },
            },
          },
        ],
      });
    } else if (m.role === 'assistant') {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          let argsObj = {};
          try {
            argsObj = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          } catch (_) {}
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: argsObj,
            },
          });
        }
      }
      rawContents.push({ role: 'model', parts });
    } else if (m.role === 'user') {
      rawContents.push({
        role: 'user',
        parts: [{ text: m.content }],
      });
    }
  }

  const contents: any[] = [];
  for (const turn of rawContents) {
    const prev = contents[contents.length - 1];
    if (prev && prev.role === turn.role) {
      prev.parts.push(...turn.parts);
    } else {
      contents.push(turn);
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: geminiTools,
  });

  let buffer = '';
  const finalToolCalls: AiToolCall[] = [];

  const handleChunk = (chunkText: string) => {
    buffer += chunkText;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(trimmed.substring(6));
        const candidate = json.candidates?.[0];
        if (!candidate) continue;

        for (const part of candidate.content?.parts || []) {
          if (part.text) {
            callbacks.onToken(part.text);
          }
          if (part.functionCall) {
            finalToolCalls.push({
              id: `gemini_call_${Date.now()}_${finalToolCalls.length}`,
              name: part.functionCall.name,
              args: part.functionCall.args || {},
              status: 'pending_approval',
            });
          }
        }
      } catch (_) {}
    }
  };

  try {
    await streamViaNativeHttp(endpoint, headers, reqBody, handleChunk, signal);

    if (buffer.trim()) {
      handleChunk('\n');
    }

    if (finalToolCalls.length > 1) {
      finalToolCalls.length = 1;
    }

    if (finalToolCalls.length > 0) {
      callbacks.onToolCalls(finalToolCalls);
    }
    callbacks.onFinish();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      callbacks.onFinish();
      return;
    }
    callbacks.onError(err);
  }
}
