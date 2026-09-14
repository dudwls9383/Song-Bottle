import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import {
  WAIT_MS,
  COOLDOWN_MS,
  bottleSchema,
  communityPostSchema,
  profileSchema,
} from '../shared/rules.js';
import { progressFor } from './progress.js';
import { artworkUrl } from './metadata.js';

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const formatDay = (value) =>
  new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(value);

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
    CREATE TABLE IF NOT EXISTS reports (user_id TEXT NOT NULL, bottle_id TEXT NOT NULL REFERENCES bottles(id), reason TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id, bottle_id));
    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
      mood TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS community_likes (
      user_id TEXT NOT NULL REFERENCES users(id), post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, PRIMARY KEY(user_id, post_id)
    );`);

  // 기존 SQLite 기록은 유지하고 새 버전의 열만 추가합니다. 이전 보틀의 장르는 추측하지 않습니다.
  for (const [table, columns] of Object.entries({
    users: {
      avatar: "TEXT NOT NULL DEFAULT 'headphones'",
      color: "TEXT NOT NULL DEFAULT 'mint'",
      title_id: "TEXT NOT NULL DEFAULT 'auto'",
    },
    bottles: {
      genre: "TEXT NOT NULL DEFAULT ''",
      bottle_color: "TEXT NOT NULL DEFAULT 'mint'",
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
  db.exec('CREATE INDEX IF NOT EXISTS community_posts_idx ON community_posts(created_at DESC)');

  function profile(userId) {
    const appearance = db
      .prepare('SELECT avatar, color, title_id AS titleId FROM users WHERE id=?')
      .get(userId);
    const rows = db
      .prepare('SELECT status, genre, message FROM bottles WHERE user_id=?')
      .all(userId);
    const progress = progressFor(rows);
    const titles = [
      { id: 'auto', name: progress.title, unlocked: true },
      ...progress.achievements.map((a) => ({ id: a.id, name: a.name, unlocked: a.unlocked })),
    ];
    const equipped = titles.find((t) => t.id === appearance.titleId && t.unlocked) || titles[0];
    return { ...appearance, ...progress, titles, titleId: equipped.id, title: equipped.name };
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
    bottleColor: row.bottle_color,
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
      db.prepare('UPDATE bottles SET bottle_color=? WHERE id=?').run(input.bottleColor, id);
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
    // 공개 소식은 교환당 한 건만 반환합니다. 비공개 해류, 메시지, 곡 URL, 사용자 ID는 제외합니다.
    activity() {
      return db
        .prepare(
          `SELECT b.id, b.genre, b.bottle_color AS color, b.matched_at AS at
        FROM bottles b JOIN bottles p ON b.partner_id=p.id
        WHERE b.status='matched' AND b.id<p.id AND b.current='' AND p.current=''
        AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.bottle_id IN (b.id,p.id))
        ORDER BY b.matched_at DESC LIMIT 24`,
        )
        .all();
    },
    updateProfile(userId, input) {
      const result = profileSchema.safeParse(input);
      if (!result.success) throw new AppError('프로필 아이콘과 색상을 선택해 주세요.');
      if (!profile(userId).titles.some((t) => t.id === result.data.titleId && t.unlocked))
        throw new AppError('아직 획득하지 않은 칭호예요.');
      db.prepare('UPDATE users SET avatar=?, color=? WHERE id=?').run(
        result.data.avatar,
        result.data.color,
        userId,
      );
      db.prepare('UPDATE users SET title_id=? WHERE id=?').run(result.data.titleId, userId);
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
    communityPosts(userId) {
      return db
        .prepare(
          `SELECT p.id, p.body, p.mood, p.created_at AS createdAt, p.user_id AS userId,
            u.avatar, u.color,
            COUNT(l.user_id) AS likes,
            MAX(CASE WHEN l.user_id=? THEN 1 ELSE 0 END) AS liked
          FROM community_posts p
          JOIN users u ON u.id=p.user_id
          LEFT JOIN community_likes l ON l.post_id=p.id
          GROUP BY p.id
          ORDER BY p.created_at DESC
          LIMIT 80`,
        )
        .all(userId)
        .map((row) => {
          const p = profile(row.userId);
          return {
            id: row.id,
            body: row.body,
            mood: row.mood,
            createdAt: row.createdAt,
            likes: row.likes,
            liked: !!row.liked,
            mine: row.userId === userId,
            listener: { avatar: row.avatar, color: row.color, level: p.level, title: p.title },
          };
        });
    },
    createCommunityPost(userId, raw) {
      const result = communityPostSchema.safeParse(raw);
      if (!result.success) throw new AppError(result.error.issues[0].message);
      const recent = db
        .prepare(
          'SELECT created_at FROM community_posts WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
        )
        .get(userId);
      if (recent && recent.created_at > Date.now() - 10000)
        throw new AppError('게시글은 잠시 후 다시 올릴 수 있어요.', 429);
      const id = randomUUID();
      db.prepare('INSERT INTO community_posts VALUES (?,?,?,?,?)').run(
        id,
        userId,
        result.data.body,
        result.data.mood,
        Date.now(),
      );
      return id;
    },
    toggleCommunityLike(userId, postId) {
      if (!db.prepare('SELECT 1 FROM community_posts WHERE id=?').get(postId))
        throw new AppError('게시글을 찾지 못했어요.', 404);
      const existing = db
        .prepare('SELECT 1 FROM community_likes WHERE user_id=? AND post_id=?')
        .get(userId, postId);
      if (existing)
        db.prepare('DELETE FROM community_likes WHERE user_id=? AND post_id=?').run(userId, postId);
      else db.prepare('INSERT INTO community_likes VALUES (?,?,?)').run(userId, postId, Date.now());
      return { liked: !existing };
    },
    stats() {
      expire();
      const statuses = db
        .prepare('SELECT status AS name, COUNT(*) AS count FROM bottles GROUP BY status')
        .all();
      const genres = db
        .prepare(
          "SELECT COALESCE(NULLIF(genre,''),'이전 기록') AS name, COUNT(*) AS count FROM bottles GROUP BY name ORDER BY count DESC, name LIMIT 12",
        )
        .all();
      const platforms = db
        .prepare(
          'SELECT platform AS name, COUNT(*) AS count FROM bottles GROUP BY platform ORDER BY count DESC, name',
        )
        .all();
      const moodCounts = new Map();
      for (const row of db.prepare('SELECT moods FROM bottles').all()) {
        for (const mood of JSON.parse(row.moods))
          moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 6);
      const matchedRows = db
        .prepare(
          "SELECT matched_at AS matchedAt FROM bottles WHERE status='matched' AND matched_at>=?",
        )
        .all(+start);
      const dailyExchanges = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(start);
        day.setDate(day.getDate() + index);
        const end = new Date(day);
        end.setDate(end.getDate() + 1);
        return {
          label: formatDay(day),
          count:
            matchedRows.filter((row) => row.matchedAt >= +day && row.matchedAt < +end).length / 2,
        };
      });
      return {
        waiting: db.prepare("SELECT COUNT(*) AS n FROM bottles WHERE status='waiting'").get().n,
        exchanges: db.prepare("SELECT COUNT(*) / 2 AS n FROM bottles WHERE status='matched'").get()
          .n,
        totalBottles: db.prepare('SELECT COUNT(*) AS n FROM bottles').get().n,
        activeUsers: db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM bottles').get().n,
        communityPosts: db.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n,
        communityLikes: db.prepare('SELECT COUNT(*) AS n FROM community_likes').get().n,
        genres,
        moods: [...moodCounts]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
          .slice(0, 12),
        platforms,
        statuses,
        dailyExchanges,
      };
    },
  };
}
