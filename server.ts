import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { attachLiveWebSocketRelay } from './server/liveRelay';
import { createApiRouter } from './server/routes';

dotenv.config();

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', createApiRouter());

  // Always return structured JSON on /api errors (malformed JSON, payload too large, etc.)
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    const message =
      err instanceof SyntaxError
        ? 'Invalid JSON in request body.'
        : err instanceof Error
          ? err.message
          : 'Unexpected server error.';
    res.status(status).json({
      ok: false,
      data: null,
      error: message,
      code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'REQUEST_ERROR',
      retryable: false,
    });
  });

  const server = http.createServer(app);
  attachLiveWebSocketRelay(server);

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RolexIQ server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RolexIQ server:', err);
  process.exit(1);
});
