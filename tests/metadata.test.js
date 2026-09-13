import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetadataService, artworkUrl } from '../server/metadata.js';
import { progressFor } from '../server/progress.js';

const youtube = 'https://youtu.be/jfKfPfyJRdk';
test('YouTube 제목·채널·커버를 조회하고 동시 요청과 추적 링크는 같은 캐시를 쓴다', async () => {
  let calls = 0;
  const service = createMetadataService(async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://www.youtube.com');
    assert.equal(url.pathname, '/oembed');
    assert.equal(options.redirect, 'error');
    return Response.json({
      title: '오늘의 노래',
      author_name: '음악 채널',
      thumbnail_url: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
      html: '<script>ignored</script>',
    });
  });
  const [first, second] = await Promise.all([
    service.lookup(youtube),
    service.lookup(`${youtube}?si=tracking`),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.title, '오늘의 노래');
  assert.equal(first.artistKind, 'channel');
  assert.equal('html' in first, false);
  await service.lookup(youtube);
  assert.equal(calls, 1);
  await assert.rejects(service.lookup('http://127.0.0.1/private'));
  assert.equal(calls, 1);
});

test('Spotify는 아티스트를 추측하지 않고 Apple Music은 정확한 곡 ID를 조회한다', async () => {
  const spotify = createMetadataService(async () =>
    Response.json({
      title: 'sekisei inko',
      author_name: 'Spotify',
      thumbnail_url: 'https://i.scdn.co/image/example',
    }),
  );
  const track = await spotify.lookup('https://open.spotify.com/track/6hxWSCuxxpsicHtEUYj5o1');
  assert.equal(track.artist, '');
  assert.ok(track.artwork);
  const apple = createMetadataService(async (url) => {
    assert.equal(url.origin, 'https://itunes.apple.com');
    assert.equal(url.searchParams.get('id'), '456');
    assert.equal(url.searchParams.get('country'), 'kr');
    return Response.json({
      results: [
        { trackId: 123, trackName: '앨범' },
        {
          trackId: 456,
          trackName: '곡',
          artistName: '아티스트',
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/test/100x100bb.jpg',
        },
      ],
    });
  });
  const result = await apple.lookup('https://music.apple.com/kr/album/test/123?i=456');
  assert.equal(result.title, '곡');
  assert.equal(result.artist, '아티스트');
});

test('SoundCloud 정보를 읽고 실패·큰 응답·임의 이미지 주소에는 대체 표시를 반환한다', async () => {
  const sc = createMetadataService(async () =>
    Response.json({
      title: '음악',
      author_name: '제작자',
      thumbnail_url: 'https://i1.sndcdn.com/artworks-example-large.jpg',
    }),
  );
  assert.equal((await sc.lookup('https://soundcloud.com/artist/song')).artist, '제작자');
  for (const fetcher of [
    async () => {
      throw new Error('timeout');
    },
    async () => new Response('', { status: 403 }),
    async () => new Response('x'.repeat(128001)),
    async () => new Response('<html>blocked</html>'),
  ]) {
    const result = await createMetadataService(fetcher).lookup(youtube);
    assert.equal(result.title, '');
    assert.equal(result.url, 'https://www.youtube.com/watch?v=jfKfPfyJRdk');
  }
  for (const url of [
    'javascript:alert(1)',
    'https://localhost/image',
    'https://i.ytimg.com.evil.test/image',
    'https://user@i.ytimg.com/test',
  ])
    assert.equal(artworkUrl(url), '');
});

test('도전과제와 레벨은 완료한 교환에만 근거해 결정된다', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    status: 'matched',
    genre: ['K-pop', 'J-pop', '보컬로이드'][i % 3],
    message: i < 3 ? '좋은 하루' : '',
  }));
  const result = progressFor([...rows, { status: 'cancelled', genre: '팝', message: '' }]);
  assert.equal(result.xp, 300);
  assert.equal(result.level, 4);
  assert.equal(result.progress, 0);
  assert.equal(result.achievements.filter((a) => a.unlocked).length, 4);
});
