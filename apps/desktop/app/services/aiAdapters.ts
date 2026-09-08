import type { AiProviderConfig, AiChatMessage, AiToolCall } from '../types/index.js';
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
];

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
  signal?: AbortSignal
): Promise<void> {
  const type = provider.type;
  const baseUrl = provider.baseUrl.trim().replace(/\/+$/, '');

  if (type === 'anthropic') {
    await streamAnthropic(baseUrl, provider.apiKey, provider.model, messages, systemPrompt, callbacks, signal);
  } else if (type === 'gemini') {
    await streamGemini(baseUrl, provider.apiKey, provider.model, messages, systemPrompt, callbacks, signal);
  } else {
    // OpenAI, Ollama, DeepSeek, OpenRouter, Custom
    await streamOpenAiCompatible(baseUrl, provider.apiKey, provider.model, messages, systemPrompt, callbacks, signal);
  }
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
  signal?: AbortSignal
) {
  let endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  // Hanya tambahkan query key jika endpoint menuju Google Generative Language API
  if (apiKey && !endpoint.includes('key=') && baseUrl.includes('googleapis.com')) {
    const sep = endpoint.includes('?') ? '&' : '?';
    endpoint = `${endpoint}${sep}key=${encodeURIComponent(apiKey)}`;
  }

  const formattedMessages: any[] = [{ role: 'system', content: systemPrompt }];

  for (const m of messages) {
    if (m.role === 'tool') {
      formattedMessages.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.content,
      });
    } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      formattedMessages.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          },
        })),
      });
    } else {
      formattedMessages.push({
        role: m.role,
        content: m.content,
      });
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      tools: AGENT_TOOLS,
      tool_choice: 'auto',
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error [${response.status}]: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response stream returned by AI provider');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const accumulatedToolCalls: Record<number, { id: string; name: string; argsStr: string }> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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

            // Content delta
            if (choice.delta?.content) {
              callbacks.onToken(choice.delta.content);
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
    }

    // Process collected tool calls
    const toolCallKeys = Object.keys(accumulatedToolCalls);
    if (toolCallKeys.length > 0) {
      const finalToolCalls: AiToolCall[] = [];
      for (const k of toolCallKeys) {
        const raw = accumulatedToolCalls[Number(k)];
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
  signal?: AbortSignal
) {
  const endpoint = `${baseUrl || 'https://api.anthropic.com'}/v1/messages`;

  const anthropicTools = AGENT_TOOLS.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const formattedMessages: any[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      formattedMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId,
            content: m.content,
          },
        ],
      });
    } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const contentList: any[] = [];
      if (m.content) contentList.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        contentList.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.args,
        });
      }
      formattedMessages.push({ role: 'assistant', content: contentList });
    } else {
      formattedMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      });
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: formattedMessages,
      tools: anthropicTools,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic Error [${response.status}]: ${errorText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const accumulatedTools: Record<number, { id: string; name: string; jsonStr: string }> = {};
  let currentToolIndex = -1;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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
              accumulatedTools[currentToolIndex].jsonStr += event.delta.partial_json;
            }
          }
        } catch (_) {}
      }
    }

    const toolKeys = Object.keys(accumulatedTools);
    if (toolKeys.length > 0) {
      const finalToolCalls: AiToolCall[] = [];
      for (const k of toolKeys) {
        const raw = accumulatedTools[Number(k)];
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
  signal?: AbortSignal
) {
  const root = baseUrl || 'https://generativelanguage.googleapis.com';
  const cleanModel = model.replace(/^models\//, '');
  const endpoint = `${root}/v1beta/models/${cleanModel}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const geminiTools = [
    {
      function_declarations: AGENT_TOOLS.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];

  const contents: any[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      let toolName = 'exec_command';
      for (const prev of messages) {
        if (prev.toolCalls) {
          const match = prev.toolCalls.find(tc => tc.id === m.toolCallId);
          if (match) {
            toolName = match.name;
            break;
          }
        }
      }
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: {
                name: toolName,
                content: m.content,
              },
            },
          },
        ],
      });
    } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: tc.args,
          },
        });
      }
      contents.push({ role: 'model', parts });
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: geminiTools,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Error [${response.status}]: ${errorText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const finalToolCalls: AiToolCall[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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
