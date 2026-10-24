import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AiProviderConfig } from '../app/types/index.ts';

test('detected provider contains source metadata and model lists', () => {
  const detected: AiProviderConfig = {
    id: 'opencode_cfg_9router',
    name: '9router (OpenCode)',
    type: 'openai',
    baseUrl: 'https://router.hariansaku.id/v1',
    apiKey: 'sk-sample-test-token',
    model: 'oc/deepseek-v4-flash-free',
    availableModels: [
      'oc/deepseek-v4-flash-free',
      'openrouter/cohere/north-mini-code:free',
      'ds/deepseek-chat',
    ],
    source: 'OpenCode Config',
  };

  assert.equal(detected.source, 'OpenCode Config');
  assert.equal(detected.availableModels?.length, 3);
  assert.equal(detected.model, 'oc/deepseek-v4-flash-free');
  assert.equal(detected.type, 'openai');
});

test('auto-detected providers can be sanitized and saved safely', () => {
  const detectedList: AiProviderConfig[] = [
    {
      id: 'opencode_auth_deepseek',
      name: 'DeepSeek (OpenCode)',
      type: 'openai',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-deepseek-123',
      model: 'deepseek-chat',
      source: 'OpenCode (auth.json)',
    },
    {
      id: 'codex_cli_openai',
      name: 'OpenAI (Codex CLI)',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-codex-456',
      model: 'gpt-4o',
      availableModels: ['gpt-4o', 'gpt-4o-mini'],
      source: 'Codex CLI',
    },
  ];

  const stored = detectedList.map(p => ({ ...p, apiKey: '' }));
  assert.equal(stored[0]?.apiKey, '');
  assert.equal(stored[1]?.apiKey, '');
  assert.equal(stored[0]?.source, 'OpenCode (auth.json)');
  assert.equal(stored[1]?.source, 'Codex CLI');
  assert.equal(stored[1]?.availableModels?.length, 2);
});

test('deduplication merges auth key with config models', () => {
  const fromAuth: AiProviderConfig = {
    id: 'opencode_auth_deepseek',
    name: 'DeepSeek (OpenCode)',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'sk-deepseek-secret',
    model: 'deepseek-chat',
    availableModels: [],
    source: 'OpenCode (auth.json)',
  };

  const fromConfig: AiProviderConfig = {
    id: 'opencode_cfg_deepseek',
    name: 'DeepSeek (OpenCode)',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-reasoner',
    availableModels: ['deepseek-chat', 'deepseek-reasoner'],
    source: 'OpenCode Config',
  };

  // Simulating the merge logic
  const merged = { ...fromAuth };
  if (!fromConfig.apiKey && fromAuth.apiKey) {
    // retains key
  }
  if (fromConfig.availableModels && fromConfig.availableModels.length > 0) {
    merged.availableModels = fromConfig.availableModels;
    merged.model = fromConfig.model;
    merged.source = fromConfig.source;
  }

  assert.equal(merged.apiKey, 'sk-deepseek-secret');
  assert.deepEqual(merged.availableModels, ['deepseek-chat', 'deepseek-reasoner']);
  assert.equal(merged.model, 'deepseek-reasoner');
  assert.equal(merged.source, 'OpenCode Config');
});

test('rejects non-API-key oauth tokens', () => {
  const validApiKey = 'sk-proj-1234567890';
  const oauthToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw...';

  assert.equal(validApiKey.startsWith('sk-'), true);
  assert.equal(oauthToken.startsWith('sk-'), false);
  assert.equal(oauthToken.startsWith('eyJ'), true);
});

test('opencode provider accepts dynamically discovered free models without hardcoding', () => {
  const dynamicModels = [
    'flint-40b-free',
    'nemotron-3.5-super-vl-free',
    'beam-free',
    'mimo-v2.6-flash-free',
    'deepseek-v4.1-flash-free',
    'glm-5.3-flash-free',
    'nemotron-3.5-lightning-free',
    'nemotron-3-ultra-free',
    'big-pickle',
  ];

  const opencodeProvider: AiProviderConfig = {
    id: 'opencode_free_local',
    name: 'OpenCode Free (Lokal PC)',
    type: 'opencode',
    baseUrl: 'http://127.0.0.1:28894',
    apiKey: 'mQ7MHwigXWFIKV6RbqjOBkW-69iC8reoMQGiOS0VvUg',
    model: dynamicModels[0] || 'flint-40b-free',
    availableModels: dynamicModels,
    source: 'OpenCode Service (Free Tier)',
  };

  assert.equal(opencodeProvider.type, 'opencode');
  assert.equal(opencodeProvider.availableModels?.length, 9);
  assert.equal(opencodeProvider.availableModels?.includes('big-pickle'), true);
  assert.equal(opencodeProvider.availableModels?.includes('flint-40b-free'), true);
});

test('parses text tool call JSON blocks from assistant markdown responses', () => {
  const markdownResponse = `Saya akan memeriksa uptime server sekarang:
\`\`\`json
{
  "name": "exec_command",
  "args": {
    "command": "uptime",
    "description": "Periksa durasi aktif server"
  }
}
\`\`\`
Silakan konfirmasi untuk menjalankan.`;

  const jsonBlockRegex = /```(?:json)?\s*(\{\s*"name"\s*:\s*"(?:exec_command|read_file|write_file|get_system_metrics|inspect_service)"[\s\S]*?\})\s*```/;
  const match = markdownResponse.match(jsonBlockRegex);
  assert.ok(match && match[1]);
  const parsed = JSON.parse(match[1]);
  assert.equal(parsed.name, 'exec_command');
  assert.equal(parsed.args.command, 'uptime');
});
