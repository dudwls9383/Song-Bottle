import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { parseSongUrl, WAIT_MS } from '../shared/rules.js';

const urls = [
  'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  'https://www.youtube.com/watch?v=5qap5aO4i9A',
  'https://open.spotify.com/track/6hxWSCuxxpsicHtEUYj5o1',
];
const payload = (index = 0, extra = {}) => ({
  url: urls[index],
  title: `곡 ${index}`,
  genre: 'K-pop',
  moods: ['밤'],
  message: '오늘도 수고했어요',
  current: '',
  requestId: randomUUID(),
  ...extra,
});
function user(store) {
  return store.authenticate(store.createSession().token);
}

test('순수 랜덤은 전용 대기열에서 교환하고 보틀 색과 칭호를 보존한다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s),
    c = user(s);
  s.send(c, payload(2));
  s.send(a, payload(0, { genre: '순수 랜덤', bottleColor: 'rose' }));
  assert.equal(s.stats().exchanges, 0);
  assert.throws(() => s.updateProfile(a, { avatar: 'disc', color: 'sky', titleId: 'first' }));
  s.send(b, payload(1, { genre: '순수 랜덤' }));
  assert.equal(s.list(b)[0].received.bottleColor, 'rose');
  assert.equal(s.list(c)[0].status, 'waiting');
  s.updateProfile(a, { avatar: 'disc', color: 'sky', titleId: 'first' });
  assert.equal(s.profile(a).title, '첫 번째 파도');
  assert.equal(s.list(b)[0].received.listener.title, '첫 번째 파도');
  s.db.close();
});

test('공개 소식은 교환당 하나이며 메시지와 비공개 해류 및 신고된 교환을 노출하지 않는다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s);
  s.send(a, payload());
  const received = s.send(b, payload(1));
  assert.equal(s.activity().length, 1);
  assert.deepEqual(Object.keys(s.activity()[0]).sort(), ['at', 'color', 'genre', 'id']);
  s.send(user(s), payload(0, { current: 'SECRET' }));
  s.send(user(s), payload(1, { current: 'SECRET' }));
  assert.equal(s.activity().length, 1);
  s.report(a, received, '기타');
  assert.equal(s.activity().length, 0);
  s.db.close();
});

test('두 사용자 교환은 양쪽에 한 번씩 기록되고 재시도는 중복 생성하지 않는다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s),
    input = payload();
  const first = s.send(a, input);
  assert.equal(s.list(a)[0].status, 'waiting');
  assert.equal(s.send(a, input), first);
  const second = s.send(b, payload(1));
  assert.equal(s.list(a)[0].received.id, second);
  assert.equal(s.list(b)[0].received.id, first);
  assert.equal(s.stats().exchanges, 1);
  assert.equal(s.stats().waiting, 0);
  s.db.close();
});

test('자기 자신, 같은 곡, 다른 장르, 다른 해류는 매칭되지 않는다', () => {
  const s = createStore(),
    a = user(s);
  s.send(a, payload());
  assert.throws(() => s.send(a, payload(1)), /이미 바다/);
  s.send(user(s), payload());
  s.send(user(s), payload(1, { genre: 'J-pop' }));
  s.send(user(s), payload(2, { current: 'PRIVATE' }));
  assert.equal(s.stats().waiting, 4);
  assert.equal(s.stats().exchanges, 0);
  s.db.close();
});

test('같은 장르와 정규화한 해류에서는 무드가 달라도 교환한다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s);
  s.send(a, payload(0, { current: ' class-01 ', moods: ['밤', '작업'] }));
  s.send(b, payload(1, { current: 'CLASS-01', moods: ['행복'] }));
  assert.equal(s.list(a)[0].status, 'matched');
  s.db.close();
});

test('취소는 소유자만 가능하며 취소·만료된 보틀은 매칭되지 않는다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s),
    id = s.send(a, payload());
  assert.throws(() => s.cancel(b, id));
  s.cancel(a, id);
  const id2 = s.send(b, payload(1));
  s.db.prepare('UPDATE bottles SET created_at=? WHERE id=?').run(Date.now() - WAIT_MS - 1000, id2);
  s.send(user(s), payload(2));
  assert.equal(s.list(a)[0].status, 'cancelled');
  assert.equal(s.list(b)[0].status, 'expired');
  assert.equal(s.stats().exchanges, 0);
  s.db.close();
});

test('같은 곡의 1시간 재전송 제한과 입력 검증을 서버에서 적용한다', () => {
  const s = createStore(),
    a = user(s),
    id = s.send(a, payload());
  s.cancel(a, id);
  assert.throws(() => s.send(a, payload()), /1시간/);
  for (const extra of [
    { genre: '' },
    { genre: '없는 장르' },
    { genre: undefined },
    { moods: ['밤', '비', '작업', '산책'] },
    { moods: ['밤', '밤'] },
    { message: '가'.repeat(21) },
    { current: '한글' },
    { url: 'javascript:alert(1)' },
  ])
    assert.throws(() => s.send(user(s), payload(1, extra)));
  s.db.close();
});

test('URL 위장 호스트와 임의 포트·앨범·재생목록 차단 및 추적 파라미터 제거', () => {
  assert.equal(parseSongUrl('https://youtu.be/jfKfPfyJRdk?si=tracking').url, urls[0]);
  for (const url of [
    'https://youtube.com.evil.test/watch?v=jfKfPfyJRdk',
    'https://evil.test/youtube.com',
    'https://user@youtube.com/watch?v=jfKfPfyJRdk',
    'https://youtube.com:999/watch?v=jfKfPfyJRdk',
    'https://open.spotify.com/playlist/6hxWSCuxxpsicHtEUYj5o1',
    'https://music.apple.com/us/album/example/12345',
  ])
    assert.throws(() => parseSongUrl(url));
});

test('신고는 본인이 받은 노래만 가능하고 상대 토큰은 반환하지 않는다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s),
    c = user(s);
  s.send(a, payload());
  const id = s.send(b, payload(1));
  assert.throws(() => s.report(c, id, '기타'));
  s.report(a, id, '기타');
  assert.equal(s.list(a)[0].reported, true);
  assert.equal('user_id' in s.list(a)[0].received, false);
  s.db.close();
});

test('서버 재시작 후 세션과 대기 보틀이 유지된다', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'song-bottle-test-')),
    filename = path.join(directory, 'test.db');
  try {
    const first = createStore(filename),
      session = first.createSession(),
      a = first.authenticate(session.token);
    first.send(a, payload());
    first.db.close();
    const second = createStore(filename);
    assert.equal(second.authenticate(session.token), a);
    assert.equal(second.list(a)[0].status, 'waiting');
    second.db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('HTTP API 인증과 동시 교환 요청의 일관성', async () => {
  const store = createStore(),
    app = createApp(store, { lookup: async () => ({}) }),
    server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    assert.equal((await fetch(`${base}/bottles`)).status, 401);
    const sessions = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(`${base}/session`, { method: 'POST' }).then((r) => r.json()),
      ),
    );
    const responses = await Promise.all(
      sessions.map((s, i) =>
        fetch(`${base}/bottles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
          body: JSON.stringify(payload(i % 3, { url: `https://youtu.be/testVideo0${i}` })),
        }),
      ),
    );
    assert.ok(responses.every((r) => r.status === 201));
    assert.equal(store.stats().exchanges, 3);
    assert.equal(store.stats().waiting, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});

test('무드 없이 교환할 수 있고 RANDOM 정렬 결과로 상대를 선택한다', () => {
  const s = createStore();
  const waiting = Array.from({ length: 4 }, () => {
    const id = user(s);
    return s.send(id, payload(0, { moods: [] }));
  });
  // SQLite 난수 함수를 결정적인 순서로 바꿔 FIFO가 아닌 무작위 정렬 경로를 검증합니다.
  let rank = 0;
  s.db.function('random', () => --rank);
  const next = user(s);
  s.send(next, payload(1, { moods: ['밤', '비', '운동'] }));
  assert.equal(s.list(next)[0].received.id, waiting.at(-1));
  s.db.close();
});

test('프로필 저장과 경험치는 서버에서 유지되고 재요청·회수는 경험치를 늘리지 않는다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s);
  const input = payload();
  s.updateProfile(a, { avatar: 'laugh', color: 'rose', xp: 99999 });
  s.send(a, input);
  assert.equal(s.profile(a).xp, 0);
  s.send(b, payload(1));
  assert.equal(s.profile(a).xp, 50);
  assert.equal(s.profile(a).achievements[0].unlocked, true);
  assert.equal(s.list(b)[0].received.listener.avatar, 'laugh');
  assert.equal(s.list(b)[0].received.listener.color, 'rose');
  s.send(a, input);
  const id = s.send(a, payload(2));
  s.cancel(a, id);
  assert.equal(s.profile(a).xp, 50);
  assert.throws(() => s.updateProfile(a, { avatar: 'unknown', color: 'rose' }));
  s.db.close();
});

test('커뮤니티 게시글은 익명 프로필과 좋아요 상태를 반환한다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s);
  s.updateProfile(a, { avatar: 'disc', color: 'sky' });
  const postId = s.createCommunityPost(a, {
    body: '오늘은 드라이브 노래 추천받고 싶어요.',
    mood: '드라이브',
  });
  assert.throws(() => s.createCommunityPost(a, { body: 'x'.repeat(141), mood: '' }));
  assert.equal(s.communityPosts(b)[0].body, '오늘은 드라이브 노래 추천받고 싶어요.');
  assert.equal(s.communityPosts(b)[0].listener.avatar, 'disc');
  assert.equal(s.communityPosts(b)[0].mine, false);
  assert.equal(s.toggleCommunityLike(b, postId).liked, true);
  assert.equal(s.communityPosts(b)[0].liked, true);
  assert.equal(s.communityPosts(a)[0].likes, 1);
  assert.equal(s.toggleCommunityLike(b, postId).liked, false);
  assert.equal(s.communityPosts(a)[0].likes, 0);
  s.db.close();
});

test('모니터링 통계는 장르, 태그, 플랫폼, 상태를 집계한다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s),
    c = user(s);
  s.send(a, payload(0, { genre: 'K-pop', moods: ['밤', '비'] }));
  s.send(b, payload(1, { genre: 'K-pop', moods: ['밤'] }));
  s.send(c, payload(2, { genre: '팝', moods: ['운동'] }));
  s.createCommunityPost(a, { body: '통계 테스트', mood: '밤' });
  const stats = s.stats();
  assert.equal(stats.totalBottles, 3);
  assert.equal(stats.exchanges, 1);
  assert.equal(stats.waiting, 1);
  assert.equal(stats.activeUsers, 3);
  assert.equal(stats.communityPosts, 1);
  assert.equal(stats.genres.find((item) => item.name === 'K-pop').count, 2);
  assert.equal(stats.moods.find((item) => item.name === '밤').count, 2);
  assert.equal(stats.platforms.find((item) => item.name === 'YouTube').count, 2);
  assert.equal(stats.statuses.find((item) => item.name === 'matched').count, 2);
  assert.equal(
    stats.dailyExchanges.reduce((sum, item) => sum + item.count, 0),
    1,
  );
  s.db.close();
});

test('기존 DB에 열을 추가해도 세션·기록은 유지하고 장르 없는 예전 보틀은 매칭하지 않는다', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'song-bottle-migration-'));
  const filename = path.join(directory, 'old.db');
  try {
    const old = new DatabaseSync(filename);
    old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL);
      CREATE TABLE bottles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), url TEXT NOT NULL,
        platform TEXT NOT NULL, title TEXT NOT NULL, moods TEXT NOT NULL, message TEXT NOT NULL, current TEXT NOT NULL,
        created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', partner_id TEXT REFERENCES bottles(id),
        matched_at INTEGER, request_id TEXT NOT NULL, UNIQUE(user_id, request_id));
      INSERT INTO users VALUES ('old-user','old-hash');`);
    old
      .prepare(
        'INSERT INTO bottles (id,user_id,url,platform,title,moods,message,current,created_at,request_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        'old-bottle',
        'old-user',
        urls[0],
        'YouTube',
        '예전 곡',
        '["밤"]',
        '',
        '',
        Date.now(),
        randomUUID(),
      );
    old.close();
    const s = createStore(filename);
    assert.equal(s.list('old-user')[0].title, '예전 곡');
    assert.equal(s.list('old-user')[0].genre, '');
    const a = user(s);
    s.send(a, payload(1));
    assert.equal(s.list(a)[0].status, 'waiting');
    s.cancel('old-user', 'old-bottle');
    s.updateProfile(a, { avatar: 'disc', color: 'sky' });
    s.db.close();
    const reopened = createStore(filename);
    assert.equal(reopened.profile(a).avatar, 'disc');
    reopened.db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
