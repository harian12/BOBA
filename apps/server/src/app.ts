import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRouter } from './routes/auth.js';
import { vaultRouter } from './routes/vault.js';

export const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/health', (c) => c.json({ status: 'ok', app: 'BOBA Sync Server', timestamp: new Date().toISOString() }));

app.route('/api/auth', authRouter);
app.route('/api/vault', vaultRouter);

export default app;
