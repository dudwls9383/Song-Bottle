import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createStore } from './store.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 배포할 때 DATABASE_PATH를 영구 디스크 경로로 지정해 주세요.
const databasePath = process.env.DATABASE_PATH || path.join(root, 'data', 'song-bottle.db');
mkdirSync(path.dirname(databasePath), { recursive: true });
const store = createStore(databasePath);
const app = createApp(store);
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}
const port = Number(process.env.PORT || 5173);
const server = app.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(`Song Bottle: http://localhost:${port}`),
);
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
