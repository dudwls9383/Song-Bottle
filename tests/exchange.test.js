import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
  moods: ['밤'],
  message: '오늘도 수고했어요',
  current: '',
  requestId: randomUUID(),
  ...extra,
});
function user(store) {
  return store.authenticate(store.createSession().token);
}

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

test('자기 자신, 같은 곡, 다른 무드, 다른 해류는 매칭되지 않는다', () => {
  const s = createStore(),
    a = user(s);
  s.send(a, payload());
  assert.throws(() => s.send(a, payload(1)), /이미 바다/);
  s.send(user(s), payload());
  s.send(user(s), payload(1, { moods: ['아침'] }));
  s.send(user(s), payload(2, { current: 'PRIVATE' }));
  assert.equal(s.stats().waiting, 4);
  assert.equal(s.stats().exchanges, 0);
  s.db.close();
});

test('해류 코드는 대소문자와 주변 공백을 정규화하고 겹치는 무드로 교환한다', () => {
  const s = createStore(),
    a = user(s),
    b = user(s);
  s.send(a, payload(0, { current: ' class-01 ', moods: ['밤', '작업'] }));
  s.send(b, payload(1, { current: 'CLASS-01', moods: ['작업'] }));
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
    { moods: [] },
    { moods: ['밤', '비', '작업'] },
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
    app = createApp(store),
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
          body: JSON.stringify(payload(i % 3)),
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
