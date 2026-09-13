import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { WAIT_MS, COOLDOWN_MS, bottleSchema, profileSchema } from '../shared/rules.js';
import { progressFor } from './progress.js';
import { artworkUrl } from './metadata.js';

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function createStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS bottles (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), url TEXT NOT NULL,
      platform TEXT NOT NULL, title TEXT NOT NULL, moods TEXT NOT NULL, message TEXT NOT NULL,
      current TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'waiting',
      partner_id TEXT REFERENCES bottles(id), matched_at INTEGER, request_id TEXT NOT NULL,
      UNIQUE(user_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS queue_idx ON bottles(status, current, created_at);
    CREATE INDEX IF NOT EXISTS user_idx ON bottles(user_id, created_at);
    CREATE TABLE IF NOT EXISTS reports (user_id TEXT NOT NULL, bottle_id TEXT NOT NULL REFERENCES bottles(id), reason TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id, bottle_id));`);

  // 기존 SQLite 기록은 유지하고 새 버전의 열만 추가합니다. 이전 보틀의 장르는 추측하지 않습니다.
  for (const [table, columns] of Object.entries({
    users: { avatar: "TEXT NOT NULL DEFAULT 'headphones'", color: "TEXT NOT NULL DEFAULT 'mint'" },
    bottles: {
      genre: "TEXT NOT NULL DEFAULT ''",
      artist: "TEXT NOT NULL DEFAULT ''",
      artwork: "TEXT NOT NULL DEFAULT ''",
      artist_kind: "TEXT NOT NULL DEFAULT 'artist'",
    },
  })) {
    const existing = new Set(
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((r) => r.name),
    );
    for (const [name, definition] of Object.entries(columns))
      if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS genre_queue_idx ON bottles(status, current, genre)');

  function profile(userId) {
    const appearance = db.prepare('SELECT avatar, color FROM users WHERE id=?').get(userId);
    const rows = db
      .prepare('SELECT status, genre, message FROM bottles WHERE user_id=?')
      .all(userId);
    return { ...appearance, ...progressFor(rows) };
  }

  const expire = () =>
    db
      .prepare("UPDATE bottles SET status='expired' WHERE status='waiting' AND created_at < ?")
      .run(Date.now() - WAIT_MS);
  const publicBottle = (row) => ({
    id: row.id,
    url: row.url,
    platform: row.platform,
    title: row.title,
    artist: row.artist,
    artwork: row.artwork,
    artistKind: row.artist_kind,
    genre: row.genre,
    moods: JSON.parse(row.moods),
    message: row.message,
    createdAt: row.created_at,
  });

  function list(userId) {
    expire();
    return db
      .prepare('SELECT * FROM bottles WHERE user_id=? ORDER BY created_at DESC, rowid DESC')
      .all(userId)
      .map((row) => {
        const partner = row.partner_id
          ? db.prepare('SELECT * FROM bottles WHERE id=?').get(row.partner_id)
          : null;
        const reported = partner
          ? !!db
              .prepare('SELECT 1 FROM reports WHERE user_id=? AND bottle_id=?')
              .get(userId, partner.id)
          : false;
        return {
          ...publicBottle(row),
          current: row.current,
          status: row.status,
          matchedAt: row.matched_at,
          received: partner
            ? {
                ...publicBottle(partner),
                listener: (() => {
                  const p = profile(partner.user_id);
                  return { avatar: p.avatar, color: p.color, level: p.level, title: p.title };
                })(),
              }
            : null,
          reported,
        };
      });
  }

  function send(userId, raw, metadata = {}) {
    const validated = bottleSchema.safeParse(raw);
    if (!validated.success) throw new AppError(validated.error.issues[0].message);
    const input = validated.data;
    // 교환과 상태 변경은 하나의 트랜잭션으로 처리해 동시 요청의 중복 수신을 막습니다.
    db.exec('BEGIN IMMEDIATE');
    try {
      expire();
      const existing = db
        .prepare('SELECT id FROM bottles WHERE user_id=? AND request_id=?')
        .get(userId, input.requestId);
      if (existing) {
        db.exec('COMMIT');
        return existing.id;
      }
      if (db.prepare("SELECT 1 FROM bottles WHERE user_id=? AND status='waiting'").get(userId))
        throw new AppError('이미 바다에 떠 있는 보틀이 있어요. 기록에서 확인해 주세요.', 409);
      if (
        db
          .prepare('SELECT 1 FROM bottles WHERE user_id=? AND url=? AND created_at>?')
          .get(userId, input.url.url, Date.now() - COOLDOWN_MS)
      )
        throw new AppError('같은 곡은 보낸 후 1시간이 지나면 다시 보낼 수 있어요.', 409);
      const id = randomUUID(),
        now = Date.now();
      const match = db
        .prepare(
          "SELECT * FROM bottles WHERE status='waiting' AND user_id<>? AND current=? AND genre=? AND url<>? ORDER BY RANDOM() LIMIT 1",
        )
        .get(userId, input.current, input.genre, input.url.url);
      db.prepare(
        'INSERT INTO bottles (id,user_id,url,platform,title,moods,message,current,created_at,request_id,genre,artist,artwork,artist_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        id,
        userId,
        input.url.url,
        input.url.platform,
        input.title || metadata.title || `${input.url.platform}에서 보낸 노래`,
        JSON.stringify(input.moods),
        input.message,
        input.current,
        now,
        input.requestId,
        input.genre,
        input.artist || metadata.artist || '',
        artworkUrl(metadata.artwork),
        metadata.artistKind === 'channel' && (!input.artist || input.artist === metadata.artist)
          ? 'channel'
          : 'artist',
      );
      if (match) {
        const update = db.prepare(
          "UPDATE bottles SET status='matched', partner_id=?, matched_at=? WHERE id=? AND status='waiting'",
        );
        update.run(match.id, now, id);
        update.run(id, now, match.id);
      }
      db.exec('COMMIT');
      return id;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    db,
    list,
    send,
    profile,
    updateProfile(userId, input) {
      const result = profileSchema.safeParse(input);
      if (!result.success) throw new AppError('프로필 아이콘과 색상을 선택해 주세요.');
      db.prepare('UPDATE users SET avatar=?, color=? WHERE id=?').run(
        result.data.avatar,
        result.data.color,
        userId,
      );
      return profile(userId);
    },
    createSession() {
      const id = randomUUID(),
        token = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO users (id,token_hash) VALUES (?,?)').run(id, hash(token));
      return { token };
    },
    authenticate(token) {
      return typeof token === 'string'
        ? db.prepare('SELECT id FROM users WHERE token_hash=?').get(hash(token))?.id
        : null;
    },
    cancel(userId, id) {
      expire();
      const r = db
        .prepare(
          "UPDATE bottles SET status='cancelled' WHERE user_id=? AND id=? AND status='waiting'",
        )
        .run(userId, id);
      if (!r.changes)
        throw new AppError('취소할 수 없는 보틀이에요. 최신 기록을 확인해 주세요.', 409);
    },
    report(userId, id, reason) {
      if (!['부적절한 메시지', '음악이 아닌 링크', '기타'].includes(reason))
        throw new AppError('신고 사유를 선택해 주세요.');
      if (!db.prepare('SELECT 1 FROM bottles WHERE user_id=? AND partner_id=?').get(userId, id))
        throw new AppError('받은 보틀만 신고할 수 있어요.', 403);
      db.prepare('INSERT OR IGNORE INTO reports VALUES (?,?,?,?)').run(
        userId,
        id,
        reason,
        Date.now(),
      );
    },
    stats() {
      expire();
      return {
        waiting: db.prepare("SELECT COUNT(*) AS n FROM bottles WHERE status='waiting'").get().n,
        exchanges: db.prepare("SELECT COUNT(*) / 2 AS n FROM bottles WHERE status='matched'").get()
          .n,
      };
    },
  };
}
