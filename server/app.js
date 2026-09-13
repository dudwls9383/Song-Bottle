import express from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from './store.js';
import { createMetadataService } from './metadata.js';
import { bottleSchema, parseSongUrl } from '../shared/rules.js';

export function createApp(store, metadata = createMetadataService()) {
  const app = express();
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use('/api', express.json({ limit: '10kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.post(
    '/api/session',
    rateLimit({ windowMs: 3600000, limit: 30, message: { error: '잠시 후 다시 접속해 주세요.' } }),
    (req, res) => res.json(store.createSession()),
  );
  app.use('/api', (req, res, next) => {
    const id = store.authenticate(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!id)
      return res
        .status(401)
        .json({ error: '연결 정보가 만료되었어요. 페이지를 새로고침해 주세요.' });
    req.userId = id;
    next();
  });
  app.get('/api/bottles', (req, res) =>
    res.json({
      bottles: store.list(req.userId),
      stats: store.stats(),
      profile: store.profile(req.userId),
    }),
  );
  app.post('/api/profile', (req, res) => res.json(store.updateProfile(req.userId, req.body)));
  app.get(
    '/api/metadata',
    rateLimit({
      windowMs: 60000,
      limit: 30,
      message: { error: '잠시 후 곡 정보를 다시 확인해 주세요.' },
    }),
    async (req, res) => {
      if (typeof req.query.url !== 'string' || req.query.url.length > 2000)
        throw new AppError('음악 링크를 확인해 주세요.');
      let song;
      try {
        song = parseSongUrl(req.query.url);
      } catch (error) {
        throw new AppError(error.message);
      }
      res.json(await metadata.lookup(song.url));
    },
  );
  app.post(
    '/api/bottles',
    rateLimit({
      windowMs: 60000,
      limit: 15,
      message: { error: '잠시 쉬었다가 다시 보내 주세요.' },
    }),
    async (req, res) => {
      const input = bottleSchema.safeParse(req.body);
      if (!input.success) throw new AppError(input.error.issues[0].message);
      const info = await metadata.lookup(input.data.url.url);
      const id = store.send(req.userId, req.body, info);
      res.status(201).json({ id });
    },
  );
  app.post('/api/bottles/:id/cancel', (req, res) => {
    store.cancel(req.userId, req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/reports', (req, res) => {
    store.report(req.userId, req.body.bottleId, req.body.reason);
    res.json({ ok: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: '요청한 주소를 찾지 못했어요.' }));
  app.use((error, req, res, next) => {
    if (!(error instanceof AppError) && error.status !== 400) console.error(error);
    res.status(error.status || 500).json({
      error:
        error instanceof AppError
          ? error.message
          : error.status === 400
            ? '입력 내용을 확인해 주세요.'
            : '서버 연결에 문제가 있어요. 잠시 후 다시 시도해 주세요.',
    });
  });
  return app;
}
