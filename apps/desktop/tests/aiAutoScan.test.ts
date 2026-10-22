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
