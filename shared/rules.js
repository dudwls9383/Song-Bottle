import { z } from 'zod';

// 수정 지점: 무드 목록과 글자 수 제한은 화면과 서버에서 함께 사용합니다.
export const MOODS = [
  '밤',
  '아침',
  '비',
  '산책',
  '작업',
  '차분함',
  '에너지 필요',
  '울고 싶어',
  '봄',
  '여름',
  '가을',
  '겨울',
  '춤추고 싶어',
  '그리움',
  '건배',
  '새벽',
  '드라이브',
  '운동',
  '여행',
  '집중',
  '휴식',
  '설렘',
  '위로',
  '행복',
  '몽환',
  '추억',
  '외로움',
  '자신감',
  '우주',
  '청량',
];
// 장르는 필수 매칭 조건, 무드는 곡을 설명하는 선택 태그입니다.
export const GENRES = [
  '순수 랜덤',
  'K-pop',
  'J-pop',
  '보컬로이드',
  '팝',
  '힙합 / R&B',
  '록 / 밴드',
  '인디 / 포크',
  '발라드',
  'EDM',
  '재즈 / 클래식',
  'OST / 게임',
  '기타',
];
export const AVATARS = ['headphones', 'smile', 'laugh', 'wink', 'music', 'disc'];
export const AVATAR_COLORS = ['mint', 'rose', 'sky', 'lemon', 'lilac', 'ink'];
export const profileSchema = z.object({
  avatar: z.enum(AVATARS),
  color: z.enum(AVATAR_COLORS),
  titleId: z.string().max(30).default('auto'),
});
export const MESSAGE_LIMIT = 20;
export const WAIT_MS = 7 * 24 * 60 * 60 * 1000;
export const COOLDOWN_MS = 60 * 60 * 1000;

// URL 파서로 호스트와 곡 경로를 검증합니다. 임의 사이트와 재생목록은 받지 않습니다.
export function parseSongUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('올바른 노래 URL을 입력해 주세요.');
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port)
    throw new Error('HTTPS 음악 링크를 사용해 주세요.');
  const host = u.hostname.replace(/^www\./, '');
  let id;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    id =
      u.pathname === '/watch'
        ? u.searchParams.get('v')
        : u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/)?.[1];
  }
  if (id && /^[a-zA-Z0-9_-]{11}$/.test(id))
    return { platform: 'YouTube', url: `https://www.youtube.com/watch?v=${id}` };
  if (host === 'open.spotify.com') {
    id = u.pathname.match(/^\/(?:intl-[a-z]+\/)?track\/([a-zA-Z0-9]{22})\/?$/)?.[1];
    if (id) return { platform: 'Spotify', url: `https://open.spotify.com/track/${id}` };
  }
  if (host === 'music.apple.com' && /^\/[a-z]{2}\/(album|song)\/.+\/\d+\/?$/.test(u.pathname)) {
    if (u.pathname.includes('/album/') && !/^\d+$/.test(u.searchParams.get('i') || ''))
      throw new Error('앨범 대신 개별 곡의 공유 링크를 넣어 주세요.');
    const songId = u.searchParams.get('i');
    return {
      platform: 'Apple Music',
      url: `${u.origin}${u.pathname}${songId ? `?i=${songId}` : ''}`,
    };
  }
  if (
    host === 'soundcloud.com' &&
    /^\/[\w-]+\/[\w-]+\/?$/.test(u.pathname) &&
    !/^\/(discover|charts|you|search)\//.test(u.pathname) &&
    !u.pathname.endsWith('/sets')
  )
    return {
      platform: 'SoundCloud',
      url: `https://soundcloud.com${u.pathname.replace(/\/$/, '')}`,
    };
  throw new Error('YouTube, Spotify, Apple Music, SoundCloud의 개별 곡 링크를 넣어 주세요.');
}

export const bottleSchema = z.object({
  bottleColor: z.enum(AVATAR_COLORS).default('mint'),
  url: z
    .string()
    .trim()
    .max(2000)
    .transform((value, ctx) => {
      try {
        return parseSongUrl(value);
      } catch (e) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: e.message });
        return z.NEVER;
      }
    }),
  title: z.string().trim().max(160).default(''),
  artist: z.string().trim().max(120).default(''),
  genre: z.enum(GENRES, { errorMap: () => ({ message: '매칭할 음악 장르를 선택해 주세요.' }) }),
  moods: z
    .array(z.enum(MOODS))
    .max(3)
    .refine((a) => new Set(a).size === a.length)
    .default([]),
  message: z
    .string()
    .trim()
    .refine((v) => Array.from(v).length <= MESSAGE_LIMIT, '메시지는 20자까지 쓸 수 있어요.')
    .default(''),
  current: z
    .string()
    .trim()
    .max(20)
    .regex(/^[a-zA-Z0-9-]*$/, '해류 코드는 영문, 숫자, 하이픈만 사용할 수 있어요.')
    .transform((v) => v.toUpperCase())
    .default(''),
  requestId: z.string().uuid(),
});
