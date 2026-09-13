import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Clipboard,
  Link2,
  Send,
  Sparkles,
  Waves,
  X,
  Check,
  Clock3,
  Shuffle,
  Pencil,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { GENRES, MOODS, MESSAGE_LIMIT, parseSongUrl } from '../../shared/rules';
import { api } from '../api';
import type { Bottle, Metadata, Snapshot } from '../types';
import { SongArt, SongItem } from '../components';

type Props = {
  data: Snapshot;
  refresh: () => Promise<void>;
  onSelect: (bottle: Bottle) => void;
  notify: (text: string) => void;
};

export default function Home({ data, refresh, onSelect, notify }: Props) {
  const [url, setUrl] = useState(''),
    [title, setTitle] = useState(''),
    [artist, setArtist] = useState(''),
    [genre, setGenre] = useState(''),
    [moods, setMoods] = useState<string[]>([]),
    [message, setMessage] = useState(''),
    [current, setCurrent] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [advanced, setAdvanced] = useState(false);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [metadataState, setMetadataState] = useState<'idle' | 'loading' | 'ready' | 'failed'>(
    'idle',
  );
  const [editing, setEditing] = useState(false);
  const [retry, setRetry] = useState(0);
  const edited = useRef({ title: false, artist: false });
  const request = useRef<{ signature: string; id: string } | null>(null);
  const pending = data.bottles.find((b) => b.status === 'waiting');
  const latest = data.bottles.find((b) => b.received && !b.reported);
  let platform = '';
  try {
    if (url) platform = parseSongUrl(url).platform;
  } catch {
    /* 입력 중인 URL은 제출할 때 검증합니다. */
  }

  function changeUrl(next: string) {
    setUrl(next);
    setTitle('');
    setArtist('');
    setMetadata(null);
    setMetadataState('idle');
    setEditing(false);
    edited.current = { title: false, artist: false };
  }

  // 입력 중 요청을 줄이고, 이전 링크의 늦은 응답이 새 곡을 덮어쓰지 않게 합니다.
  useEffect(() => {
    if (!platform) return;
    let active = true;
    setMetadataState('loading');
    const timer = setTimeout(() => {
      void api<Metadata>(`/metadata?url=${encodeURIComponent(url)}`)
        .then((info) => {
          if (!active) return;
          setMetadata(info);
          if (!edited.current.title) setTitle(info.title);
          if (!edited.current.artist) setArtist(info.artist);
          setMetadataState(info.title ? 'ready' : 'failed');
        })
        .catch(() => {
          if (active) setMetadataState('failed');
        });
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [url, platform, retry]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    try {
      parseSongUrl(url);
      if (!genre) throw new Error('매칭할 음악 장르를 선택해 주세요.');
      setBusy(true);
      const payload = { url, title, artist, genre, moods, message, current };
      const signature = JSON.stringify(payload);
      if (request.current?.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      await api('/bottles', { ...payload, requestId: request.current!.id });
      await refresh();
      changeUrl('');
      setMoods([]);
      setMessage('');
      request.current = null;
      notify('보틀을 바다에 띄웠어요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '보내지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    try {
      changeUrl(await navigator.clipboard.readText());
    } catch {
      notify('입력칸을 길게 누르거나 Ctrl+V로 붙여넣어 주세요.');
    }
  }

  return (
    <>
      <section className="page-intro">
        <div>
          <div className="eyebrow">
            <span /> SONG BOTTLE / MUSIC CONNECTS US
          </div>
          <h1>
            Song Bottle
            <br />
            <em>오늘은 어떤 취향?</em>
          </h1>
          <p>당신의 취향이 누군가의 새로운 발견이 되는 곳.</p>
        </div>
        <img className="mobile-bottle" src="/assets/bottle.png" alt="음악이 담긴 보틀" />
        <span className="edition">
          SONG BOTTLE
          <br />
          VOL. 01 / 2026
        </span>
      </section>
      <div className="home-grid">
        <section className="compose-section">
          <div className="section-heading">
            <h2>
              <Send size={18} />
              노래 보내기
            </h2>
            <span>01 / COMPOSE</span>
          </div>
          {pending ? (
            <div className="waiting-state" aria-live="polite">
              <div className="waiting-icon">
                <img src="/assets/bottle.png" alt="표류하는 음악 보틀" />
              </div>
              <span className="status waiting">표류 중</span>
              <h2>
                누군가의 취향을 향해
                <br />
                흘러가고 있어요.
              </h2>
              <p>
                {pending.genre
                  ? `${pending.genre}의 새로운 취향을 기다려요.`
                  : '이전 버전 보틀이에요. 회수 후 장르를 골라 다시 보내주세요.'}
                <br />
                최대 7일 동안 기다릴 수 있어요.
              </p>
              <SongItem song={pending} />
              <button className="primary" onClick={() => onSelect(pending)}>
                보틀 확인하기
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <form onSubmit={send} noValidate>
              <label htmlFor="song-url">
                노래 링크 <span className="required">*</span>
              </label>
              <div className={`url-field ${platform ? 'valid' : ''}`}>
                <Link2 size={20} />
                <input
                  id="song-url"
                  type="url"
                  placeholder="좋아하는 곡의 URL을 붙여넣으세요"
                  value={url}
                  onChange={(e) => changeUrl(e.target.value)}
                  required
                  maxLength={2000}
                />
                <button
                  type="button"
                  className="icon-button"
                  title="링크 붙여넣기"
                  aria-label="링크 붙여넣기"
                  onClick={paste}
                >
                  <Clipboard size={18} />
                </button>
              </div>
              <div className="supported">
                {platform ? (
                  <span className="valid-text">
                    <Check size={14} />
                    {platform} 링크가 준비됐어요
                  </span>
                ) : (
                  <>
                    <span className="youtube-dot" />
                    YouTube
                    <span className="spotify-dot" />
                    Spotify
                    <span className="apple-dot" />
                    Apple Music
                    <span className="soundcloud-dot" />
                    SoundCloud
                  </>
                )}
              </div>
              {platform && (
                <div className="metadata-preview" aria-live="polite">
                  <SongArt platform={platform} artwork={metadata?.artwork} />
                  <div className="metadata-copy">
                    <strong>
                      {title ||
                        (metadataState === 'loading'
                          ? '곡 정보를 찾고 있어요...'
                          : '링크가 준비됐어요')}
                    </strong>
                    <span>
                      {artist
                        ? `${metadata?.artistKind === 'channel' ? '채널 · ' : ''}${artist}`
                        : metadataState === 'failed'
                          ? '자동 조회가 안 되어도 보낼 수 있어요.'
                          : metadataState === 'ready'
                            ? platform
                            : '잠시만 기다려 주세요'}
                    </span>
                  </div>
                  {metadataState === 'loading' ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <button
                      type="button"
                      className="icon-button"
                      title="곡 정보 수정"
                      aria-label="곡 정보 수정"
                      aria-expanded={editing}
                      onClick={() => setEditing(!editing)}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                  {metadataState === 'failed' && (
                    <button
                      type="button"
                      className="icon-button"
                      title="곡 정보 다시 조회"
                      aria-label="곡 정보 다시 조회"
                      onClick={() => setRetry(retry + 1)}
                    >
                      <RefreshCw size={16} />
                    </button>
                  )}
                </div>
              )}
              {(editing || metadataState === 'failed') && (
                <div className="metadata-editor">
                  <label htmlFor="song-title">
                    곡 제목 <span>선택</span>
                  </label>
                  <input
                    className="text-input"
                    id="song-title"
                    placeholder="직접 입력해도 좋아요"
                    value={title}
                    onChange={(e) => {
                      edited.current.title = true;
                      setTitle(e.target.value);
                    }}
                    maxLength={160}
                  />
                  <label htmlFor="song-artist">
                    아티스트 / 채널 <span>선택</span>
                  </label>
                  <input
                    className="text-input"
                    id="song-artist"
                    placeholder="아티스트 또는 채널 이름"
                    value={artist}
                    onChange={(e) => {
                      edited.current.artist = true;
                      setArtist(e.target.value);
                    }}
                    maxLength={120}
                  />
                </div>
              )}
              <fieldset className="genre-picker">
                <legend>
                  어떤 음악을 나눌까요? <span className="required">*</span>
                </legend>
                <div className="genre-options">
                  {GENRES.map((g) => (
                    <label key={g} className={genre === g ? 'selected' : ''}>
                      <input
                        type="radio"
                        name="genre"
                        value={g}
                        checked={genre === g}
                        onChange={() => setGenre(g)}
                      />
                      <span>{g}</span>
                    </label>
                  ))}
                </div>
                <div className="matching-note">
                  <Shuffle size={15} />
                  <span>
                    {genre ? `${genre} 안에서 랜덤 매칭` : '함께 교환할 음악 장르를 골라주세요'}
                  </span>
                </div>
              </fieldset>
              <div className="field-label">
                <label>어떤 순간에 듣나요?</label>
                <span>선택 · {moods.length} / 3</span>
              </div>
              <div className="mood-options" role="group" aria-label="무드 태그">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={moods.includes(m)}
                    className={moods.includes(m) ? 'selected' : ''}
                    onClick={() => {
                      if (moods.includes(m)) setMoods(moods.filter((x) => x !== m));
                      else if (moods.length < 3) setMoods([...moods, m]);
                      else notify('무드는 최대 3개까지 선택할 수 있어요.');
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="field-label">
                <label htmlFor="message">함께 보내는 한마디</label>
                <span>선택</span>
              </div>
              <div className="message-field">
                <textarea
                  id="message"
                  placeholder="이 노래를 듣게 될 누군가에게"
                  value={message}
                  onChange={(e) =>
                    setMessage(Array.from(e.target.value).slice(0, MESSAGE_LIMIT).join(''))
                  }
                  rows={2}
                />
                <span>
                  {Array.from(message).length} / {MESSAGE_LIMIT}
                </span>
              </div>
              <button
                className="current-toggle"
                type="button"
                aria-expanded={advanced}
                onClick={() => setAdvanced(!advanced)}
              >
                <Waves size={17} />
                해류 코드 {current && <span>{current}</span>}
                <span className="push">{advanced ? '−' : '+'}</span>
              </button>
              {advanced && (
                <div className="current-field">
                  <label htmlFor="current">해류 코드</label>
                  <input
                    className="text-input"
                    id="current"
                    placeholder="예: SONG-BOTTLE"
                    value={current}
                    maxLength={20}
                    onChange={(e) => setCurrent(e.target.value.toUpperCase())}
                  />
                  <p>같은 코드와 장르를 선택한 사람끼리 만나요. 비워두면 모두의 바다로 보내요.</p>
                </div>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button className="primary send-button" disabled={busy} type="submit">
                <Send size={18} />
                {busy ? '바다로 보내는 중...' : '보틀 띄우기'}
                <ArrowRight size={18} />
              </button>
              <p className="form-footnote">한 곡을 보내면, 한 곡이 돌아와요.</p>
            </form>
          )}
        </section>
        <aside className="ocean-section">
          <div className="ocean-caption">
            <span>
              <span className="live-dot" />
              OUR LITTLE OCEAN
            </span>
            <Waves size={20} />
          </div>
          <div className="ocean-visual">
            <img
              className="bottle-illustration"
              src="/assets/bottle.png"
              alt="음표와 편지가 담긴 유리병이 물 위에 떠 있는 모습"
            />
            <div className="ocean-wave wave-one" />
            <div className="ocean-wave wave-two" />
          </div>
          <div className="ocean-copy">
            <span className="eyebrow">서로 다른 취향, 하나의 바다</span>
            <h2>
              낯선 노래가
              <br />
              익숙한 하루를 바꿀 때.
            </h2>
            <p>
              어딘가의 누군가도 지금,
              <br />
              당신에게 보낼 노래를 고르고 있을 거예요.
            </p>
          </div>
          <div className="ocean-stats">
            <div>
              <strong>{data.stats.waiting.toLocaleString()}</strong>
              <span>표류 중인 보틀</span>
            </div>
            <div>
              <strong>{data.stats.exchanges.toLocaleString()}</strong>
              <span>이어진 음악</span>
            </div>
          </div>
        </aside>
      </div>
      <section className="recent-section">
        <div className="section-heading">
          <h2>
            <Sparkles size={18} />
            나에게 도착한 음악
          </h2>
          <span>02 / DISCOVER</span>
        </div>
        {latest?.received ? (
          <SongItem
            song={latest.received}
            action={
              <button
                className="icon-button"
                aria-label="최근 교환 보기"
                onClick={() => onSelect(latest)}
              >
                <ArrowRight size={20} />
              </button>
            }
          />
        ) : (
          <div className="recent-empty">
            <Clock3 size={19} />
            <p>첫 번째 만남을 기다리고 있어요.</p>
            <span>노래 한 곡으로 시작해 보세요.</span>
          </div>
        )}
      </section>
    </>
  );
}
