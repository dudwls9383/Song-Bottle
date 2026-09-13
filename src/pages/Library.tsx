import { useState } from 'react';
import { ArrowUpRight, Download, Heart, Search, Clock3 } from 'lucide-react';
import type { Bottle, Song } from '../types';
import { Empty, SongItem } from '../components';
import { GENRES, MOODS } from '../../shared/rules';

export const STATUS = {
  waiting: '표류 중',
  matched: '교환 완료',
  cancelled: '취소됨',
  expired: '기간 만료',
};
export const date = (n: number) =>
  new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(n);

export function History({
  bottles,
  onSelect,
}: {
  bottles: Bottle[];
  onSelect: (b: Bottle) => void;
}) {
  const [filter, setFilter] = useState('all');
  const filtered = bottles.filter((b) => filter === 'all' || b.status === filter);
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">YOUR MUSICAL JOURNEY</span>
        <h1>교환 기록</h1>
        <p>내가 띄운 마음과 나에게 도착한 취향.</p>
      </div>
      <div className="tabs" aria-label="교환 상태">
        {[
          ['all', '전체'],
          ['waiting', '표류 중'],
          ['matched', '교환 완료'],
        ].map(([v, label]) => (
          <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>
            {label}
          </button>
        ))}
      </div>
      {!filtered.length ? (
        <Empty title="아직 교환 기록이 없어요">좋아하는 곡을 담아 첫 보틀을 띄워보세요.</Empty>
      ) : (
        <div className="history-list">
          {filtered.map((b) => (
            <article className="history-entry" key={b.id}>
              <button className="history-heading" onClick={() => onSelect(b)}>
                <span>
                  <Clock3 size={15} />
                  {date(b.createdAt)}
                </span>
                <span className={`status ${b.status}`}>{STATUS[b.status]}</span>
                <ArrowUpRight size={18} />
              </button>
              {b.received && !b.reported && <SongItem song={b.received} label="받은 노래" />}
              {b.reported && <p className="muted">신고한 보틀은 숨겼어요.</p>}
              <SongItem song={b} label="보낸 노래" />
              {b.current && <p className="current-note">해류 · {b.current}</p>}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function Playlist({ bottles, notify }: { bottles: Bottle[]; notify: (m: string) => void }) {
  const [direction, setDirection] = useState('all'),
    [platform, setPlatform] = useState('all'),
    [mood, setMood] = useState('all'),
    [genre, setGenre] = useState('all'),
    [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('song-bottle-favorites') || '[]');
      return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const songs: (Song & { direction: string })[] = bottles.flatMap((b) => [
    { ...b, direction: 'sent' },
    ...(b.received && !b.reported ? [{ ...b.received, direction: 'received' }] : []),
  ]);
  const visible = songs.filter(
    (s) =>
      (direction === 'all' || s.direction === direction) &&
      (platform === 'all' || s.platform === platform) &&
      (mood === 'all' || s.moods.includes(mood)) &&
      (genre === 'all' || s.genre === genre) &&
      (!onlyFavorites || favorites.includes(s.id)) &&
      `${s.title} ${s.artist} ${s.message}`.toLowerCase().includes(search.toLowerCase()),
  );
  function favorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next);
    try {
      localStorage.setItem('song-bottle-favorites', JSON.stringify(next));
    } catch {
      notify('이 브라우저에 즐겨찾기를 저장하지 못했어요.');
    }
  }
  function download() {
    const blob = new Blob(
      [visible.map((s) => `${s.title}${s.artist ? ` - ${s.artist}` : ''}\n${s.url}\n`).join('\n')],
      {
        type: 'text/plain;charset=utf-8',
      },
    );
    const href = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = href;
    link.download = 'song-bottle-playlist.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    notify('플레이리스트를 내려받았어요.');
  }
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">COLLECTED MOMENTS</span>
        <div className="title-row">
          <h1>플레이리스트</h1>
          <button
            className="icon-button"
            aria-label="플레이리스트 다운로드"
            title="플레이리스트 다운로드"
            disabled={!visible.length}
            onClick={download}
          >
            <Download size={21} />
          </button>
        </div>
        <p>다시 꺼내 듣고 싶은, 우리의 음악들.</p>
      </div>
      <div className="library-toolbar">
        <div className="tabs">
          {[
            ['all', '전체'],
            ['received', '받은 곡'],
            ['sent', '보낸 곡'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={v === direction ? 'active' : ''}
              onClick={() => setDirection(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          className={`icon-button ${onlyFavorites ? 'favorite' : ''}`}
          aria-label="즐겨찾기만 보기"
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites(!onlyFavorites)}
        >
          <Heart size={20} fill={onlyFavorites ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="library-filters">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="노래 검색"
            placeholder="노래 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="음악 플랫폼"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          {['all', 'YouTube', 'Spotify', 'Apple Music', 'SoundCloud'].map((p) => (
            <option key={p} value={p}>
              {p === 'all' ? '모든 플랫폼' : p}
            </option>
          ))}
        </select>
        <select aria-label="무드 필터" value={mood} onChange={(e) => setMood(e.target.value)}>
          <option value="all">모든 무드</option>
          {MOODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select aria-label="장르 필터" value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="all">모든 장르</option>
          {GENRES.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </div>
      <p className="list-count">{visible.length}곡</p>
      {visible.length ? (
        <div className="playlist-list">
          {visible.map((s) => (
            <SongItem
              key={`${s.direction}-${s.id}`}
              song={s}
              label={s.direction === 'sent' ? '보낸 곡' : '받은 곡'}
              action={
                <button
                  className={`icon-button ${favorites.includes(s.id) ? 'favorite' : ''}`}
                  aria-label={`${s.title} 즐겨찾기`}
                  aria-pressed={favorites.includes(s.id)}
                  onClick={() => favorite(s.id)}
                >
                  <Heart size={19} fill={favorites.includes(s.id) ? 'currentColor' : 'none'} />
                </button>
              }
            />
          ))}
        </div>
      ) : (
        <Empty title="아직 담긴 음악이 없어요">보틀을 보내거나 검색 조건을 바꿔보세요.</Empty>
      )}
    </>
  );
}
