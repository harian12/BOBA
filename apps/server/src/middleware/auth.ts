import { createMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'boba-super-secret-sync-key-change-in-prod';

export interface AuthContext {
  userId: string;
  email: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthContext;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    c.set('user', { userId: payload.sub, email: payload.email });
    await next();
  } catch {
    return c.json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' }, 401);
  }
});

export function generateToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '30d' });
}
