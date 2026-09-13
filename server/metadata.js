import { parseSongUrl } from '../shared/rules.js';

const clean = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');

export function artworkUrl(value) {
  try {
    const u = new URL(value);
    const hosts = [
      'i.ytimg.com',
      'i.scdn.co',
      'image-cdn-ak.spotifycdn.com',
      'i1.sndcdn.com',
      'i2.sndcdn.com',
    ];
    if (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      (hosts.includes(u.hostname) || /^[a-z0-9-]+\.mzstatic\.com$/.test(u.hostname))
    )
      return u.href;
  } catch {
    /* 없는 이미지는 공통 앨범 커버로 표시합니다. */
  }
  return '';
}

// 사용자 URL을 직접 크롤링하지 않고, 검증된 서비스의 고정 JSON API만 조회합니다.
export function createMetadataService(fetcher = fetch) {
  const cache = new Map();
  const pending = new Map();

  async function lookup(raw) {
    const song = parseSongUrl(raw);
    const cached = cache.get(song.url);
    if (cached?.expires > Date.now()) return cached.data;
    if (pending.has(song.url)) return pending.get(song.url);
    const job = load(song)
      .then((data) => {
        if (cache.size >= 500) cache.delete(cache.keys().next().value);
        cache.set(song.url, { data, expires: Date.now() + (data.title ? 3600000 : 60000) });
        return data;
      })
      .finally(() => pending.delete(song.url));
    pending.set(song.url, job);
    return job;
  }

  async function load(song) {
    const result = { ...song, title: '', artist: '', artwork: '', artistKind: 'artist' };
    const source = new URL(song.url);
    let endpoint;
    if (song.platform === 'Apple Music') {
      const id = source.searchParams.get('i') || source.pathname.split('/').filter(Boolean).at(-1);
      endpoint = new URL('https://itunes.apple.com/lookup');
      endpoint.search = new URLSearchParams({
        id,
        country: source.pathname.split('/')[1],
        entity: 'song',
      }).toString();
    } else {
      endpoint = new URL(
        {
          YouTube: 'https://www.youtube.com/oembed',
          Spotify: 'https://open.spotify.com/oembed',
          SoundCloud: 'https://soundcloud.com/oembed',
        }[song.platform],
      );
      endpoint.search = new URLSearchParams({ url: song.url, format: 'json' }).toString();
    }
    try {
      const response = await fetcher(endpoint, {
        signal: AbortSignal.timeout(4500),
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return result;
      // 외부 응답 크기를 제한해 비정상 응답도 짧게 끝냅니다.
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 128000) {
          await reader.cancel();
          return result;
        }
        chunks.push(Buffer.from(value));
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (song.platform === 'Apple Music') {
        const track = data.results?.find(
          (r) => String(r.trackId) === endpoint.searchParams.get('id'),
        );
        if (track) {
          result.title = clean(track.trackName, 160);
          result.artist = clean(track.artistName, 120);
          result.artwork = artworkUrl(track.artworkUrl100);
        }
      } else {
        result.title = clean(data.title, 160);
        result.artist = song.platform === 'Spotify' ? '' : clean(data.author_name, 120);
        result.artistKind = song.platform === 'YouTube' ? 'channel' : 'artist';
        result.artwork = artworkUrl(data.thumbnail_url);
      }
    } catch {
      /* 조회 실패는 교환을 막지 않습니다. 제목은 나중에 직접 입력할 수 있습니다. */
    }
    return result;
  }
  return { lookup };
}
