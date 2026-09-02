import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/index';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateToken } from '../middleware/auth';

export const authRouter = new Hono();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = registerSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: 'INVALID_INPUT', details: result.error.format() }, 400);
  }

  const { email, password } = result.data;

  const existingList = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingList.length > 0) {
    return c.json({ error: 'USER_EXISTS', message: 'Email is already registered' }, 409);
  }

  const userId = crypto.randomUUID();
  const salt = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(password, 10);

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  });

  const token = generateToken(userId, email);

  return c.json({
    userId,
    email,
    salt,
    token,
  }, 201);
});

authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = loginSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: 'INVALID_INPUT', details: result.error.format() }, 400);
  }

  const { email, password } = result.data;
  const userList = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (userList.length === 0) {
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }, 401);
  }

  const user = userList[0];
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }, 401);
  }

  const token = generateToken(user.id, user.email);

  return c.json({
    userId: user.id,
    email: user.email,
    salt: user.salt,
    token,
  });
});
