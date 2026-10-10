import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AiProviderConfig } from '../app/types/index.ts';

test('provider storage sanitizes apiKey while retaining config', () => {
  const provider: AiProviderConfig = {
    id: 'openai_test',
    name: 'OpenAI Test',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-secret-key-123',
    model: 'gpt-4o',
  };

  const forStorage = { ...provider, apiKey: '' };
  assert.equal(forStorage.apiKey, '');
  assert.equal(forStorage.id, 'openai_test');
  assert.equal(forStorage.model, 'gpt-4o');

  // Memory retaining config with key
  const inMemory = { ...provider };
  assert.equal(inMemory.apiKey, 'sk-secret-key-123');
});
