import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { vaultBlobs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

export const vaultRouter = new Hono();

vaultRouter.use('*', authMiddleware);

const putVaultSchema = z.object({
  expectedVersion: z.number().int().min(0),
  encryptedData: z.string().min(1),
  checksum: z.string().min(1),
});

vaultRouter.get('/', async (c) => {
  const user = c.get('user');
  const vaultList = await db.select().from(vaultBlobs).where(eq(vaultBlobs.userId, user.userId)).limit(1);

  if (vaultList.length === 0) {
    return c.json({
      version: 0,
      encryptedData: null,
      checksum: null,
      updatedAt: null,
    });
  }

  const vault = vaultList[0];
  return c.json({
    version: vault.version,
    encryptedData: vault.encryptedData,
    checksum: vault.checksum,
    updatedAt: vault.updatedAt,
  });
});

vaultRouter.put('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const result = putVaultSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'INVALID_INPUT', details: result.error.format() }, 400);
  }

  const { expectedVersion, encryptedData, checksum } = result.data;

  // Verify client checksum against sha256 of encryptedData
  const computedHash = crypto.createHash('sha256').update(encryptedData).digest('hex');
  if (computedHash !== checksum) {
    return c.json({ error: 'CHECKSUM_MISMATCH', message: 'Payload checksum does not match' }, 400);
  }

  const currentList = await db.select().from(vaultBlobs).where(eq(vaultBlobs.userId, user.userId)).limit(1);
  const currentVault = currentList.length > 0 ? currentList[0] : null;
  const currentVersion = currentVault ? currentVault.version : 0;

  // Version Concurrency Check
  if (currentVersion !== expectedVersion) {
    return c.json({
      error: 'VERSION_CONFLICT',
      message: 'Server has a newer or different vault version',
      currentVersion,
    }, 409);
  }

  const nextVersion = currentVersion + 1;
  const now = new Date().toISOString();

  if (!currentVault) {
    await db.insert(vaultBlobs).values({
      userId: user.userId,
      version: nextVersion,
      encryptedData,
      checksum,
      updatedAt: now,
    });
  } else {
    await db.update(vaultBlobs)
      .set({
        version: nextVersion,
        encryptedData,
        checksum,
        updatedAt: now,
      })
      .where(eq(vaultBlobs.userId, user.userId));
  }

  return c.json({
    version: nextVersion,
    checksum,
    updatedAt: now,
  });
});
