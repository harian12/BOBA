import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import crypto from 'crypto';

describe('BOBA Server Auth & Vault Sync Tests', () => {
  const testEmail = `user_${Date.now()}@test.com`;
  const testPassword = 'SecretMasterPassword123!';
  let authToken = '';
  let userSalt = '';

  it('1. should register a new user and return JWT + Salt', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('salt');
    expect(data).toHaveProperty('token');
    authToken = data.token;
    userSalt = data.salt;
  });

  it('2. should reject duplicate registration', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(res.status).toBe(409);
  });

  it('3. should login successfully with correct credentials', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeDefined();
    expect(data.salt).toBe(userSalt);
  });

  it('4. should get empty vault on initial sync', async () => {
    const res = await app.request('/api/vault', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.version).toBe(0);
    expect(data.encryptedData).toBeNull();
  });

  it('5. should save encrypted vault blob with expectedVersion = 0', async () => {
    const mockEncryptedData = Buffer.from('AES256GCM_ENCRYPTED_PAYLOAD_TEST').toString('base64');
    const checksum = crypto.createHash('sha256').update(mockEncryptedData).digest('hex');

    const res = await app.request('/api/vault', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        expectedVersion: 0,
        encryptedData: mockEncryptedData,
        checksum,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.version).toBe(1);
  });

  it('6. should reject PUT if expectedVersion conflicts (Concurrency Control)', async () => {
    const mockEncryptedData = Buffer.from('NEW_PAYLOAD').toString('base64');
    const checksum = crypto.createHash('sha256').update(mockEncryptedData).digest('hex');

    // Expected version 0, but current version in DB is already 1
    const res = await app.request('/api/vault', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        expectedVersion: 0,
        encryptedData: mockEncryptedData,
        checksum,
      }),
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('VERSION_CONFLICT');
    expect(data.currentVersion).toBe(1);
  });

  it('7. should fetch updated vault blob', async () => {
    const res = await app.request('/api/vault', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.version).toBe(1);
    expect(data.encryptedData).toBe(Buffer.from('AES256GCM_ENCRYPTED_PAYLOAD_TEST').toString('base64'));
  });
});
